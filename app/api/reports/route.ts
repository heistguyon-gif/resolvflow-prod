import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { accounts, appUsers, campaigns, scheduledPosts } from "../../../db/schema";
import { authErrorResponse, canSeeRanking, isPlatformAdminEmail, requireWorkspaceContext } from "../../../lib/auth";

function validIso(value: string | null, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value); return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function avatarUrl(id: string | null | undefined) {
  return id ? `/api/profile/avatar/${id}` : null;
}

function ownerKeys(user: { id: string; email: string }) {
  return [...new Set([user.id, `nexoflow:${user.email}`])];
}

export async function GET(request: Request) {
  try {
    const context = await requireWorkspaceContext(request, "viewer");
    const ownerUserId = context.workspaceOwnerUserId;
    const db = getDb(); const url = new URL(request.url); const now = new Date();
    const from = validIso(url.searchParams.get("from"), new Date(now.getTime() - 30 * 86_400_000).toISOString());
    const to = validIso(url.searchParams.get("to"), now.toISOString());
    const lite = url.searchParams.get("lite") === "1";
    const wantRanking = canSeeRanking(context.email);
    const viewerIsAdmin = isPlatformAdminEmail(context.email);
    const platformScope = url.searchParams.get("scope") === "platform" && viewerIsAdmin;
    const publishedInPeriod = and(
      platformScope ? undefined : eq(scheduledPosts.ownerUserId, ownerUserId),
      eq(scheduledPosts.status, "published"),
      isNotNull(scheduledPosts.publishedAt),
      gte(scheduledPosts.publishedAt, from),
      lte(scheduledPosts.publishedAt, to),
    );
    const failedInPeriod = and(
      platformScope ? undefined : eq(scheduledPosts.ownerUserId, ownerUserId),
      inArray(scheduledPosts.status, ["failed", "blocked"]),
      gte(scheduledPosts.updatedAt, from),
      lte(scheduledPosts.updatedAt, to),
    );
    const globalPublishedRange = and(eq(scheduledPosts.status, "published"), isNotNull(scheduledPosts.publishedAt), gte(scheduledPosts.publishedAt, from), lte(scheduledPosts.publishedAt, to));
    const emptyMedia: Array<{ id: string; campaignId: string; campaignName: string; accountId: string; username: string; mediaType: string; publishedAt: string | null; views: number; reach: number; insightsSyncedAt: string | null; insightsError: string | null; publishedMediaId: string | null }> = [];
    const [accountRows, publishedStats, failedStats, perMedia, toolUsers, accountAgg, publishedAgg] = await Promise.all([
      platformScope ? db.select().from(accounts) : db.select().from(accounts).where(eq(accounts.ownerUserId, ownerUserId)),
      db.select({
        accountId: scheduledPosts.accountId,
        published: sql<number>`count(*)`,
        views: sql<number>`coalesce(sum(${scheduledPosts.mediaViews}), 0)`,
        reach: sql<number>`coalesce(sum(${scheduledPosts.mediaReach}), 0)`,
        insightsSynced: sql<number>`coalesce(sum(case when ${scheduledPosts.insightsSyncedAt} is not null and ${scheduledPosts.insightsError} is null then 1 else 0 end), 0)`,
        insightsErrors: sql<number>`coalesce(sum(case when ${scheduledPosts.insightsError} is not null then 1 else 0 end), 0)`,
        lastInsightsSyncAt: sql<string | null>`max(${scheduledPosts.insightsSyncedAt})`,
      }).from(scheduledPosts).where(publishedInPeriod).groupBy(scheduledPosts.accountId),
      db.select({
        accountId: scheduledPosts.accountId,
        failed: sql<number>`coalesce(sum(case when ${scheduledPosts.status} = 'failed' then 1 else 0 end), 0)`,
        blocked: sql<number>`coalesce(sum(case when ${scheduledPosts.status} = 'blocked' then 1 else 0 end), 0)`,
      }).from(scheduledPosts).where(failedInPeriod).groupBy(scheduledPosts.accountId),
      lite ? Promise.resolve(emptyMedia) : db.select({
        id: scheduledPosts.id, campaignId: scheduledPosts.campaignId, campaignName: campaigns.name, accountId: scheduledPosts.accountId, username: accounts.username,
        mediaType: campaigns.mediaType, publishedAt: scheduledPosts.publishedAt, views: scheduledPosts.mediaViews, reach: scheduledPosts.mediaReach,
        insightsSyncedAt: scheduledPosts.insightsSyncedAt, insightsError: scheduledPosts.insightsError, publishedMediaId: scheduledPosts.publishedMediaId,
      }).from(scheduledPosts).innerJoin(campaigns, eq(scheduledPosts.campaignId, campaigns.id)).innerJoin(accounts, eq(scheduledPosts.accountId, accounts.id)).where(publishedInPeriod).orderBy(desc(scheduledPosts.publishedAt)).limit(2_000),
      wantRanking ? db.select({
        id: appUsers.id,
        email: appUsers.email,
        displayName: appUsers.displayName,
        avatarMediaId: appUsers.avatarMediaId,
      }).from(appUsers).where(eq(appUsers.status, "active")) : Promise.resolve([]),
      wantRanking ? db.select({
        ownerUserId: accounts.ownerUserId,
        accountCount: sql<number>`count(*)`,
      }).from(accounts).groupBy(accounts.ownerUserId) : Promise.resolve([]),
      wantRanking ? db.select({
        ownerUserId: accounts.ownerUserId,
        published: sql<number>`count(*)`,
      }).from(scheduledPosts).innerJoin(accounts, eq(scheduledPosts.accountId, accounts.id)).where(globalPublishedRange).groupBy(accounts.ownerUserId) : Promise.resolve([]),
    ]);
    const publishedByAccount = new Map(publishedStats.map((item) => [item.accountId, { published: Number(item.published) || 0, views: Number(item.views) || 0, reach: Number(item.reach) || 0, insightsSynced: Number(item.insightsSynced) || 0, insightsErrors: Number(item.insightsErrors) || 0, lastInsightsSyncAt: item.lastInsightsSyncAt }]));
    const failedByAccount = new Map(failedStats.map((item) => [item.accountId, { failed: Number(item.failed) || 0, blocked: Number(item.blocked) || 0 }]));
    const published = publishedStats.reduce((sum, item) => sum + (Number(item.published) || 0), 0);
    const failed = failedStats.reduce((sum, item) => sum + (Number(item.failed) || 0), 0);
    const blocked = failedStats.reduce((sum, item) => sum + (Number(item.blocked) || 0), 0);
    const insightsSynced = publishedStats.reduce((sum, item) => sum + (Number(item.insightsSynced) || 0), 0);
    const insightsErrors = publishedStats.reduce((sum, item) => sum + (Number(item.insightsErrors) || 0), 0);
    const lastInsightsSyncAt = publishedStats.reduce<string | null>((latest, item) => !item.lastInsightsSyncAt || (latest && latest >= item.lastInsightsSyncAt) ? latest : item.lastInsightsSyncAt, null);
    const perAccount = accountRows.filter((item) => item.source === "meta_oauth").map((account) => {
      const ownPublished = publishedByAccount.get(account.id)?.published ?? 0;
      const ownFailed = failedByAccount.get(account.id)?.failed ?? 0;
      const mediaViews = publishedByAccount.get(account.id)?.views ?? 0;
      const mediaReach = publishedByAccount.get(account.id)?.reach ?? 0;
      const ownInsightsSynced = publishedByAccount.get(account.id)?.insightsSynced ?? 0;
      const ownInsightsErrors = publishedByAccount.get(account.id)?.insightsErrors ?? 0;
      return { id: account.id, username: account.username, model: account.model, player: account.player, groupName: account.groupName, niche: account.niche, views30d: mediaViews, reach30d: mediaReach, followersCount: account.followersCount, published: ownPublished, failed: ownFailed, insightsSynced: ownInsightsSynced, insightsPending: Math.max(0, ownPublished - ownInsightsSynced), insightsErrors: ownInsightsErrors, lastInsightsSyncAt: publishedByAccount.get(account.id)?.lastInsightsSyncAt ?? null, successRate: ownPublished + ownFailed ? Math.round((ownPublished / (ownPublished + ownFailed)) * 100) : 0 };
    }).sort((a, b) => b.views30d - a.views30d);
    const accountMap = new Map(accountAgg.map((row) => [row.ownerUserId, Number(row.accountCount) || 0]));
    const publishedMap = new Map(publishedAgg.map((row) => [row.ownerUserId, Number(row.published) || 0]));
    const seenEmails = new Set<string>();
    const ranking = toolUsers.filter((user) => {
      const email = user.email.toLowerCase();
      if (!viewerIsAdmin && isPlatformAdminEmail(email)) return false;
      if (seenEmails.has(email)) return false;
      seenEmails.add(email);
      return true;
    }).map((user) => {
      const keys = ownerKeys(user);
      const accountCount = keys.reduce((sum, key) => sum + (accountMap.get(key) || 0), 0);
      const publishedCount = keys.reduce((sum, key) => sum + (publishedMap.get(key) || 0), 0);
      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName || user.email,
        avatarUrl: avatarUrl(user.avatarMediaId),
        posts: publishedCount,
        accountCount,
        isYou: user.email.toLowerCase() === context.email.toLowerCase(),
      };
    }).sort((left, right) => right.posts - left.posts || left.displayName.localeCompare(right.displayName, "pt-BR"));
    return Response.json({
      period: { from, to },
      scope: platformScope ? "platform" : "workspace",
      totals: {
        accounts: perAccount.length,
        campaigns: new Set(perMedia.map((item) => item.campaignId)).size || publishedByAccount.size,
        published,
        failed,
        blocked,
        views30d: perAccount.reduce((sum, item) => sum + item.views30d, 0),
        reach30d: perAccount.reduce((sum, item) => sum + item.reach30d, 0),
        followers: perAccount.reduce((sum, item) => sum + item.followersCount, 0),
        insightsSynced,
        insightsPending: Math.max(0, published - insightsSynced),
        insightsErrors,
        insightsCoverage: published ? Math.round((insightsSynced / published) * 100) : 100,
        lastInsightsSyncAt,
        successRate: published + failed ? Math.round((published / (published + failed)) * 100) : 0,
      },
      perAccount,
      perMedia,
      ranking: wantRanking ? ranking : undefined,
    });
  } catch (error) {
    const authError = authErrorResponse(error); if (authError) return authError;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar os relatórios." }, { status: 500 });
  }
}
