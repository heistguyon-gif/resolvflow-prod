import { and, desc, eq, inArray, ne, sql, type AnyColumn } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accounts, campaigns, metaConnections, scheduledPosts, workspaces } from "../../../../db/schema";
import { resolveAdminAnalysisScope } from "../../../../lib/admin-analysis-scope";
import { ADMIN_CONNECTED_PROFILE_EXISTS_SQL, ADMIN_CONNECTED_PROFILE_GLOBAL_COUNT_SQL, adminPeriod } from "../../../../lib/admin-readonly";
import { authErrorResponse, requirePlatformAdmin } from "../../../../lib/auth";

const num = (value: unknown) => Number(value) || 0;
const metricSql = {
  posts: sql<number>`count(*)`,
  views: sql<number>`coalesce(sum(${scheduledPosts.mediaViews}), 0)`,
  reach: sql<number>`coalesce(sum(${scheduledPosts.mediaReach}), 0)`,
};

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const params = new URL(request.url).searchParams;
    const scope = await resolveAdminAnalysisScope(params.get("userId"));
    if (!scope) return Response.json({ error: "Usuário não encontrado." }, { status: 404 });
    const period = adminPeriod(params.get("from"), params.get("to"));
    if (!period) return Response.json({ error: "Período inválido." }, { status: 400 });
    const db = getDb();
    const byOwner = (owner: AnyColumn) => scope.ownerIds === null ? undefined
      : scope.ownerIds.length ? inArray(owner, scope.ownerIds) : sql`0 = 1`;
    const publishedIn = (from: string, to: string) => and(byOwner(scheduledPosts.ownerUserId), eq(scheduledPosts.status, "published"),
      sql`${scheduledPosts.publishedAt} >= ${from}`, sql`${scheduledPosts.publishedAt} <= ${to}`);
    const span = new Date(period.to).getTime() - new Date(period.from).getTime();
    const previous = span < 370 * 86400000 ? { from: new Date(new Date(period.from).getTime() - span - 1).toISOString(),
      to: new Date(new Date(period.from).getTime() - 1).toISOString() } : null;
    const bucket = span <= 45 * 86400000 ? sql`substr(${scheduledPosts.publishedAt}, 1, 10)`
      : span <= 370 * 86400000 ? sql`strftime('%Y-W%W', ${scheduledPosts.publishedAt})`
        : sql`substr(${scheduledPosts.publishedAt}, 1, 7)`;
    const rankingBy = params.get("ranking") === "views" ? "views" : params.get("ranking") === "reach" ? "reach" : "posts";
    const rankType = scope.subject && params.get("rankType") === "campaigns" ? "campaigns" : scope.subject ? "profiles" : "workspaces";
    const rankKey = rankType === "campaigns" ? scheduledPosts.campaignId : rankType === "profiles" ? scheduledPosts.accountId : scheduledPosts.ownerUserId;
    const rankOrder = rankingBy === "views" ? metricSql.views : rankingBy === "reach" ? metricSql.reach : metricSql.posts;
    const [current, prior, accountTotals, campaignTotals, queueTotals, failedPeriod, connectionTotals, lastSync,
      followersRows, seriesRows, rankingRows, workspaceRows] = await Promise.all([
      db.select({ posts: metricSql.posts, views: metricSql.views, reach: metricSql.reach })
        .from(scheduledPosts).where(publishedIn(period.from, period.to)),
      previous ? db.select({ posts: metricSql.posts, views: metricSql.views }).from(scheduledPosts)
        .where(publishedIn(previous.from, previous.to)) : Promise.resolve([]),
      db.select({ registered: sql<number>`count(*)`, archived: sql<number>`sum(case when ${accounts.archivedAt} is not null then 1 else 0 end)`,
        connected: sql<number>`${sql.raw(ADMIN_CONNECTED_PROFILE_GLOBAL_COUNT_SQL)}`,
        disconnected: sql<number>`count(distinct case when ${accounts.archivedAt} is null and ${accounts.instagramAccountId} is not null and not ${sql.raw(ADMIN_CONNECTED_PROFILE_EXISTS_SQL)} then ${accounts.ownerUserId} || char(31) || ${accounts.instagramAccountId} end)`,
        restricted: sql<number>`count(distinct case when ${accounts.archivedAt} is null and (lower(${accounts.healthStatus}) like '%restr%' or lower(${accounts.healthStatus}) like '%susp%') then ${accounts.ownerUserId} || char(31) || coalesce(${accounts.instagramAccountId}, ${accounts.id}) end)` })
        .from(accounts).where(byOwner(accounts.ownerUserId)),
      db.select({ total: sql<number>`count(*)`, active: sql<number>`sum(case when ${campaigns.status} in ('scheduled','paused') then 1 else 0 end)` })
        .from(campaigns).where(and(byOwner(campaigns.ownerUserId), ne(campaigns.status, "template"))),
      db.select({ pending: sql<number>`sum(case when ${scheduledPosts.status} in ('pending','retry','container_created','processing') then 1 else 0 end)`,
        failed: sql<number>`sum(case when ${scheduledPosts.status} in ('failed','blocked') then 1 else 0 end)`,
        overdue: sql<number>`sum(case when ${scheduledPosts.status} in ('pending','retry') and replace(${scheduledPosts.scheduledFor}, 'T', ' ') < datetime('now') then 1 else 0 end)` })
        .from(scheduledPosts).where(byOwner(scheduledPosts.ownerUserId)),
      db.select({ failed: sql<number>`count(*)` }).from(scheduledPosts).where(and(byOwner(scheduledPosts.ownerUserId),
        inArray(scheduledPosts.status, ["failed", "blocked"]), sql`${scheduledPosts.updatedAt} >= ${period.from}`,
        sql`${scheduledPosts.updatedAt} <= ${period.to}`)),
      db.select({ total: sql<number>`count(*)` }).from(metaConnections).where(byOwner(metaConnections.ownerUserId)),
      db.select({ lastSyncAt: sql<string | null>`max(${metaConnections.lastSyncAt})` })
        .from(metaConnections).where(byOwner(metaConnections.ownerUserId)),
      db.select({ ownerUserId: accounts.ownerUserId, instagramAccountId: accounts.instagramAccountId,
        followers: sql<number>`max(${accounts.followersCount})` }).from(accounts)
        .where(and(byOwner(accounts.ownerUserId), sql`${accounts.archivedAt} is null`, sql`${accounts.instagramAccountId} is not null`))
        .groupBy(accounts.ownerUserId, accounts.instagramAccountId),
      db.select({ bucket, posts: metricSql.posts, views: metricSql.views }).from(scheduledPosts)
        .where(publishedIn(period.from, period.to)).groupBy(bucket).orderBy(desc(bucket)).limit(36),
      db.select({ key: rankKey, ownerUserId: scheduledPosts.ownerUserId, posts: metricSql.posts,
        views: metricSql.views, reach: metricSql.reach }).from(scheduledPosts)
        .where(publishedIn(period.from, period.to)).groupBy(rankKey, scheduledPosts.ownerUserId)
        .orderBy(desc(rankOrder)).limit(10),
      scope.ownerIds === null ? db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces)
        : scope.ownerIds.length ? db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces)
          .where(inArray(workspaces.id, scope.ownerIds)) : Promise.resolve([]),
    ]);
    const workspaceById = new Map(workspaceRows.map(row => [row.id, row.name]));
    const rankKeys = rankingRows.map(row => row.key);
    const rankNames = rankType === "profiles" && rankKeys.length
      ? await db.select({ id: accounts.id, label: accounts.username }).from(accounts).where(inArray(accounts.id, rankKeys))
      : rankType === "campaigns" && rankKeys.length
        ? await db.select({ id: campaigns.id, label: campaigns.name }).from(campaigns).where(inArray(campaigns.id, rankKeys)) : [];
    const nameById = new Map(rankNames.map(row => [row.id, row.label]));
    const posts = num(current[0]?.posts), failed = num(failedPeriod[0]?.failed);
    const alerts = { failed: num(queueTotals[0]?.failed), overdue: num(queueTotals[0]?.overdue),
      restricted: num(accountTotals[0]?.restricted), disconnected: num(accountTotals[0]?.disconnected),
      lastSyncAt: lastSync[0]?.lastSyncAt || null };
    const rawSeries = seriesRows.reverse().map(row => ({ bucket: String(row.bucket), posts: num(row.posts), views: num(row.views) }));
    const series = span <= 45 * 86400000 ? (() => {
      const byDay = new Map(rawSeries.map(row => [row.bucket, row]));
      const result = [];
      const day = new Date(`${period.from.slice(0, 10)}T12:00:00.000Z`);
      const last = period.to.slice(0, 10);
      while (day.toISOString().slice(0, 10) <= last && result.length <= 45) {
        const key = day.toISOString().slice(0, 10);
        result.push(byDay.get(key) || { bucket: key, posts: 0, views: 0 });
        day.setUTCDate(day.getUTCDate() + 1);
      }
      return result;
    })() : rawSeries;
    return Response.json({ checkedAt: new Date().toISOString(), scope: { user: scope.subject,
      workspaces: workspaceRows.map(row => ({ id: row.id, name: row.name })) }, period, previous,
      kpis: { views: num(current[0]?.views), posts, followers: followersRows.reduce((sum, row) => sum + num(row.followers), 0),
        successRate: posts + failed ? Math.round(posts / (posts + failed) * 1000) / 10 : null,
        resolved: posts + failed, failedInPeriod: failed, previousViews: num(prior[0]?.views), previousPosts: num(prior[0]?.posts) },
      secondary: { registered: num(accountTotals[0]?.registered), connected: num(accountTotals[0]?.connected),
        archived: num(accountTotals[0]?.archived), connections: num(connectionTotals[0]?.total),
        campaigns: num(campaignTotals[0]?.total), activeCampaigns: num(campaignTotals[0]?.active),
        queue: num(queueTotals[0]?.pending), failed: num(queueTotals[0]?.failed) },
      alerts, series,
      ranking: { type: rankType, metric: rankingBy, rows: rankingRows.map(row => ({ key: row.key,
        ownerUserId: row.ownerUserId, label: rankType === "workspaces" ? workspaceById.get(row.ownerUserId) || "Workspace" : nameById.get(row.key) || "Perfil",
        workspaceName: workspaceById.get(row.ownerUserId) || "Workspace", posts: num(row.posts), views: num(row.views), reach: num(row.reach) })) },
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: "Não foi possível carregar a análise administrativa." }, { status: 500 });
  }
}
