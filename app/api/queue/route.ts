import { and, asc, desc, eq, gte, inArray, like, or, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { accounts, campaigns, scheduledPosts } from "../../../db/schema";
import { authErrorResponse, isPlatformAdminEmail, requireOwnerId, requireWorkspaceContext } from "../../../lib/auth";
import { recordAuditEvent } from "../../../lib/audit";

const LIVE_STATUSES = ["pending", "retry", "container_created", "processing", "paused"];
const ISSUE_STATUSES = ["failed", "blocked"];

export async function GET(request: Request) {
  try {
    const context = await requireWorkspaceContext(request, "viewer");
    const ownerUserId = context.workspaceOwnerUserId;
    const url = new URL(request.url);
    const platformScope = url.searchParams.get("scope") === "platform" && isPlatformAdminEmail(context.email);
    const tab = url.searchParams.get("tab") === "published" || url.searchParams.get("tab") === "failed" ? url.searchParams.get("tab")! : "live";
    const status = url.searchParams.get("status")?.trim() || "";
    const campaignId = url.searchParams.get("campaignId")?.trim() || "";
    const accountId = url.searchParams.get("accountId")?.trim() || "";
    const search = url.searchParams.get("search")?.trim() || "";
    const requestedSort = url.searchParams.get("sort") || "";
    const sort = ["scheduled_asc", "scheduled_desc", "event_asc", "event_desc"].includes(requestedSort)
      ? requestedSort
      : tab === "live" ? "scheduled_asc" : "event_desc";
    const recentPublished = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const tabStatuses = tab === "published" ? ["published"] : tab === "failed" ? ISSUE_STATUSES : LIVE_STATUSES;
    const filters = [inArray(scheduledPosts.status, status && tabStatuses.includes(status) ? [status] : tabStatuses)];
    if (!platformScope) filters.unshift(eq(scheduledPosts.ownerUserId, ownerUserId));
    if (tab === "published") filters.push(gte(scheduledPosts.publishedAt, recentPublished));
    if (campaignId) filters.push(eq(scheduledPosts.campaignId, campaignId));
    if (accountId) filters.push(eq(scheduledPosts.accountId, accountId));
    if (search) {
      const needle = `%${search.replaceAll("%", "").replaceAll("_", "")}%`;
      filters.push(or(like(accounts.username, needle), like(campaigns.name, needle)));
    }
    const db = getDb();
    const sortColumn = sort.startsWith("event_") && tab === "published"
      ? scheduledPosts.publishedAt
      : sort.startsWith("event_") && tab === "failed"
        ? scheduledPosts.updatedAt
        : scheduledPosts.scheduledFor;
    const orderBy = sort.endsWith("_desc") ? desc(sortColumn) : asc(sortColumn);
    const scheduledTieBreak = sort.endsWith("_desc") ? desc(scheduledPosts.scheduledFor) : asc(scheduledPosts.scheduledFor);
    const [rows, grouped] = await Promise.all([
      db.select({
        id: scheduledPosts.id,
        campaignId: scheduledPosts.campaignId,
        accountId: scheduledPosts.accountId,
        status: scheduledPosts.status,
        scheduledFor: scheduledPosts.scheduledFor,
        publishedAt: scheduledPosts.publishedAt,
        updatedAt: scheduledPosts.updatedAt,
        attemptCount: scheduledPosts.attemptCount,
        maxAttempts: scheduledPosts.maxAttempts,
        lastError: scheduledPosts.lastError,
        publishedMediaId: scheduledPosts.publishedMediaId,
        publishedPermalink: scheduledPosts.publishedPermalink,
        captionOverride: scheduledPosts.captionOverride,
        captionFallback: scheduledPosts.captionFallback,
        captionFallbackCommentId: scheduledPosts.captionFallbackCommentId,
        mediaViews: scheduledPosts.mediaViews,
        mediaReach: scheduledPosts.mediaReach,
        insightsSyncedAt: scheduledPosts.insightsSyncedAt,
        insightsError: scheduledPosts.insightsError,
        campaignName: campaigns.name,
        mediaType: campaigns.mediaType,
        username: accounts.username,
      }).from(scheduledPosts)
        .innerJoin(campaigns, eq(scheduledPosts.campaignId, campaigns.id))
        .innerJoin(accounts, eq(scheduledPosts.accountId, accounts.id))
        .where(and(...filters))
        .orderBy(orderBy, scheduledTieBreak, asc(scheduledPosts.id))
        .limit(tab === "live" ? 2000 : 500),
      db.select({
        status: scheduledPosts.status,
        total: sql<number>`count(*)`,
      }).from(scheduledPosts).where(and(
        platformScope ? undefined : eq(scheduledPosts.ownerUserId, ownerUserId),
        or(
          inArray(scheduledPosts.status, [...LIVE_STATUSES, ...ISSUE_STATUSES]),
          and(eq(scheduledPosts.status, "published"), gte(scheduledPosts.publishedAt, recentPublished)),
        ),
      )).groupBy(scheduledPosts.status),
    ]);
    const byStatus = Object.fromEntries(grouped.map((row) => [row.status, Number(row.total) || 0]));
    const counts = {
      live: LIVE_STATUSES.reduce((sum, key) => sum + (byStatus[key] || 0), 0),
      published: byStatus.published || 0,
      failed: ISSUE_STATUSES.reduce((sum, key) => sum + (byStatus[key] || 0), 0),
      paused: byStatus.paused || 0,
    };
    return Response.json({ queue: rows, tab, counts, scope: platformScope ? "platform" : "workspace" });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar a fila." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ownerUserId = await requireOwnerId(request);
    const payload = await request.json() as { action?: string };
    if (payload.action !== "purge_dead") return Response.json({ error: "Ação inválida." }, { status: 400 });
    const db = getDb();
    const nowIso = new Date().toISOString();
    const dead = and(
      eq(scheduledPosts.ownerUserId, ownerUserId),
      or(
        eq(scheduledPosts.status, "blocked"),
        and(
          inArray(scheduledPosts.status, ["retry", "failed"]),
          or(
            like(scheduledPosts.lastError, "%Conecte esta conta à Meta%"),
            like(scheduledPosts.lastError, "%precisa ser renovada%"),
            like(scheduledPosts.lastError, "%cannot access the app%"),
            like(scheduledPosts.lastError, "%validating access token%"),
            like(scheduledPosts.lastError, "%instagram.com%"),
            like(scheduledPosts.lastError, "%checkpoint%"),
            like(scheduledPosts.lastError, "%access token%"),
          ),
        ),
      ),
    );
    const cancelled = await db.update(scheduledPosts).set({
      status: "cancelled",
      lastError: "Fila morta limpa: conexão Meta inválida ou ausente.",
      lockedAt: null,
      lockToken: null,
      updatedAt: nowIso,
    }).where(dead).returning({ id: scheduledPosts.id });
    await recordAuditEvent(request, { ownerUserId, action: "queue.purge_dead", entityType: "scheduled_post", summary: `${cancelled.length} item(ns) mortos cancelados na fila.` });
    return Response.json({ cancelled: cancelled.length });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível limpar a fila morta." }, { status: 500 });
  }
}
