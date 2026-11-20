import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { accounts, campaignMedia, campaigns, metaConnections, publicationAttempts, scheduledPosts } from "../../../../../db/schema";
import { authErrorResponse } from "../../../../../lib/auth";
import { requireReadOnlyOwnerId } from "../../../../../lib/campaign-read-access";
import { campaignActivityAttempt, campaignActivityMessage, campaignActivityTimestamp, diagnoseCampaignPost } from "../../../../../lib/campaign-activity";
import type { CampaignActivityFilter, CampaignActivityPost, CampaignActivityResponse, CampaignPostActivityResponse } from "../../../../../lib/campaign-activity-types";
import { sanitizeMetaMessage } from "../../../../../lib/meta-diagnostics";

const ACTIVE_STATUSES = ["pending", "retry", "container_created", "processing"];
const FILTERS: CampaignActivityFilter[] = ["issues", "failed", "waiting", "published", "all"];
const responseHeaders = { "cache-control": "private, no-store" };

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerUserId = await requireReadOnlyOwnerId(request);
    const { id } = await context.params;
    const db = getDb();
    const [campaign] = await db.select({ id: campaigns.id, name: campaigns.name, status: campaigns.status, timezone: campaigns.timezone }).from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.ownerUserId, ownerUserId))).limit(1);
    if (!campaign) return Response.json({ error: "Campanha não encontrada." }, { status: 404, headers: responseHeaders });
    const url = new URL(request.url);
    const state = url.searchParams.get("state") || "issues";
    const page = Number(url.searchParams.get("page") || 1);
    const requestedPageSize = Number(url.searchParams.get("pageSize") || 25);
    if (!FILTERS.includes(state as CampaignActivityFilter) || !Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(requestedPageSize) || requestedPageSize < 1) {
      return Response.json({ error: "Filtro ou paginação inválidos." }, { status: 400, headers: responseHeaders });
    }
    const pageSize = Math.min(requestedPageSize, 50);
    const offset = (page - 1) * pageSize;
    if (!Number.isSafeInteger(offset)) return Response.json({ error: "Página inválida." }, { status: 400, headers: responseHeaders });
    const fetchedAt = new Date().toISOString();
    const scope = and(eq(scheduledPosts.ownerUserId, ownerUserId), eq(scheduledPosts.campaignId, id));
    const errorPresent = sql<boolean>`length(trim(coalesce(${scheduledPosts.lastError}, ''))) > 0`;
    const waiting = and(inArray(scheduledPosts.status, ACTIVE_STATUSES), errorPresent)!;
    const delayed = and(inArray(scheduledPosts.status, ACTIVE_STATUSES), sql`${scheduledPosts.scheduledFor} < ${fetchedAt}`)!;
    const latestAttemptId = sql<string>`(select pa.id from publication_attempts pa
      inner join scheduled_posts scoped_post on scoped_post.id = pa.scheduled_post_id
        and scoped_post.owner_user_id = ${ownerUserId} and scoped_post.campaign_id = ${id}
      where pa.owner_user_id = ${ownerUserId} and pa.scheduled_post_id = ${scheduledPosts.id}
      order by pa.created_at desc, pa.id desc limit 1)`;
    const postSelection = {
      id: scheduledPosts.id, accountId: scheduledPosts.accountId, username: accounts.username,
      fileName: campaignMedia.fileName, status: scheduledPosts.status,
      scheduledFor: scheduledPosts.scheduledFor, nextAttemptAt: scheduledPosts.nextAttemptAt,
      publishedAt: scheduledPosts.publishedAt, updatedAt: scheduledPosts.updatedAt,
      attemptCount: scheduledPosts.attemptCount, maxAttempts: scheduledPosts.maxAttempts,
      lastError: scheduledPosts.lastError, insightsError: scheduledPosts.insightsError,
      mediaViews: scheduledPosts.mediaViews, mediaReach: scheduledPosts.mediaReach,
      insightsSyncedAt: scheduledPosts.insightsSyncedAt,
      originalConnectionError: metaConnections.lastError,
      lastAttempt: {
        id: publicationAttempts.id, stage: publicationAttempts.stage, outcome: publicationAttempts.outcome,
        message: publicationAttempts.message, createdAt: publicationAttempts.createdAt, metaErrorCode: publicationAttempts.metaErrorCode,
      },
    };
    const postsQuery = () => db.select(postSelection).from(scheduledPosts)
      .leftJoin(accounts, and(eq(accounts.id, scheduledPosts.accountId), eq(accounts.ownerUserId, ownerUserId)))
      .leftJoin(campaignMedia, and(eq(campaignMedia.id, scheduledPosts.mediaItemId), eq(campaignMedia.ownerUserId, ownerUserId), eq(campaignMedia.campaignId, id)))
      .leftJoin(metaConnections, and(eq(metaConnections.id, scheduledPosts.connectionId), eq(metaConnections.ownerUserId, ownerUserId)))
      .leftJoin(publicationAttempts, and(eq(publicationAttempts.id, latestAttemptId), eq(publicationAttempts.ownerUserId, ownerUserId), eq(publicationAttempts.scheduledPostId, scheduledPosts.id)));
    const toPost = (row: Awaited<ReturnType<typeof postsQuery>>[number]): CampaignActivityPost => {
      const post = {
        id: row.id, accountId: row.accountId, username: sanitizeMetaMessage(row.username || "Perfil indisponível"),
        fileName: row.fileName ? sanitizeMetaMessage(row.fileName) : null, status: row.status,
        scheduledFor: campaignActivityTimestamp(row.scheduledFor), nextAttemptAt: campaignActivityTimestamp(row.nextAttemptAt), publishedAt: campaignActivityTimestamp(row.publishedAt), updatedAt: campaignActivityTimestamp(row.updatedAt),
        attemptCount: row.attemptCount, maxAttempts: row.maxAttempts,
        lastError: campaignActivityMessage(row.lastError), insightsError: campaignActivityMessage(row.insightsError),
        mediaViews: row.mediaViews, mediaReach: row.mediaReach, insightsSyncedAt: campaignActivityTimestamp(row.insightsSyncedAt),
        lastAttempt: row.lastAttempt ? campaignActivityAttempt(row.lastAttempt) : null,
      };
      return { ...post, diagnosis: diagnoseCampaignPost(post, fetchedAt, row.originalConnectionError) };
    };
    const postId = url.searchParams.get("postId");
    if (postId) {
      const [post] = await postsQuery().where(and(scope, eq(scheduledPosts.id, postId))).limit(1);
      if (!post) return Response.json({ error: "Publicação não encontrada nesta campanha." }, { status: 404, headers: responseHeaders });
      const attempts = await db.select({ id: publicationAttempts.id, stage: publicationAttempts.stage, outcome: publicationAttempts.outcome, message: publicationAttempts.message, createdAt: publicationAttempts.createdAt, metaErrorCode: publicationAttempts.metaErrorCode })
        .from(publicationAttempts).innerJoin(scheduledPosts, and(eq(scheduledPosts.id, publicationAttempts.scheduledPostId), scope, eq(scheduledPosts.id, postId)))
        .where(and(eq(publicationAttempts.ownerUserId, ownerUserId), eq(publicationAttempts.scheduledPostId, postId)))
        .orderBy(desc(publicationAttempts.createdAt), desc(publicationAttempts.id)).limit(31);
      const result: CampaignPostActivityResponse = { fetchedAt, post: toPost(post), attempts: attempts.slice(0, 30).map(campaignActivityAttempt), hasMoreAttempts: attempts.length > 30 };
      return Response.json(result, { headers: responseHeaders });
    }

    const filters = [scope];
    const accountId = url.searchParams.get("accountId");
    if (accountId) filters.push(eq(scheduledPosts.accountId, accountId));
    if (state === "issues") filters.push(sql`(${scheduledPosts.status} in ('failed','blocked') or ${errorPresent} or length(trim(coalesce(${scheduledPosts.insightsError}, ''))) > 0 or ${delayed})`);
    if (state === "failed") filters.push(inArray(scheduledPosts.status, ["failed", "blocked"]));
    if (state === "waiting") filters.push(waiting);
    if (state === "published") filters.push(eq(scheduledPosts.status, "published"));
    const statusCount = (status: string) => sql<number>`coalesce(sum(case when ${scheduledPosts.status} = ${status} then 1 else 0 end), 0)`;
    const [summaryRows, accountRows, countRows, pageRows] = await Promise.all([
      db.select({ total: sql<number>`count(*)`, published: statusCount("published"), failed: statusCount("failed"), blocked: statusCount("blocked"), waiting: sql<number>`coalesce(sum(case when ${waiting} then 1 else 0 end), 0)`, delayed: sql<number>`coalesce(sum(case when ${delayed} then 1 else 0 end), 0)`, pending: statusCount("pending"), processing: statusCount("processing"), paused: statusCount("paused"), cancelled: statusCount("cancelled") }).from(scheduledPosts).where(scope),
      db.select({ id: scheduledPosts.accountId, username: accounts.username, total: sql<number>`count(*)`, published: statusCount("published"), failed: statusCount("failed"), blocked: statusCount("blocked"), waiting: sql<number>`coalesce(sum(case when ${waiting} then 1 else 0 end), 0)`, healthStatus: accounts.healthStatus, connectionStatus: metaConnections.status, lastError: sql<string | null>`coalesce(${metaConnections.lastError}, ${accounts.lastError})`, lastSyncAt: metaConnections.lastSyncAt, quotaUsed: metaConnections.publishingLimitUsed, quotaTotal: metaConnections.publishingLimitTotal })
        .from(scheduledPosts).leftJoin(accounts, and(eq(accounts.id, scheduledPosts.accountId), eq(accounts.ownerUserId, ownerUserId)))
        .leftJoin(metaConnections, and(eq(metaConnections.instagramUserId, accounts.instagramAccountId), eq(metaConnections.ownerUserId, ownerUserId)))
        .where(scope).groupBy(scheduledPosts.accountId).orderBy(asc(accounts.username), asc(scheduledPosts.accountId)),
      db.select({ total: sql<number>`count(*)` }).from(scheduledPosts).where(and(...filters)),
      postsQuery().where(and(...filters)).orderBy(asc(scheduledPosts.scheduledFor), asc(scheduledPosts.id)).limit(pageSize).offset(offset),
    ]);
    const summary = Object.fromEntries(Object.entries(summaryRows[0]).map(([key, value]) => [key, Number(value || 0)])) as CampaignActivityResponse["summary"];
    const total = Number(countRows[0]?.total || 0);
    const result: CampaignActivityResponse = {
      fetchedAt, campaign: { ...campaign, name: sanitizeMetaMessage(campaign.name) }, summary,
      accounts: accountRows.map((account) => ({ ...account, username: sanitizeMetaMessage(account.username || "Perfil indisponível"), healthStatus: account.healthStatus ? sanitizeMetaMessage(account.healthStatus) : null, lastError: campaignActivityMessage(account.lastError), lastSyncAt: campaignActivityTimestamp(account.lastSyncAt), total: Number(account.total), published: Number(account.published), failed: Number(account.failed), blocked: Number(account.blocked), waiting: Number(account.waiting) })),
      posts: pageRows.map(toPost), pagination: { page, pageSize, total, hasMore: offset + pageRows.length < total },
    };
    return Response.json(result, { headers: responseHeaders });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: "Não foi possível consultar a atividade da campanha." }, { status: 500, headers: responseHeaders });
  }
}
