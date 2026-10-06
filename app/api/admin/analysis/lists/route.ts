import { and, asc, desc, eq, inArray, ne, sql, type AnyColumn } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { accounts, campaigns, metaConnections, scheduledPosts, workspaces } from "../../../../../db/schema";
import { resolveAdminAnalysisScope } from "../../../../../lib/admin-analysis-scope";
import { ADMIN_CONNECTED_PROFILE_EXISTS_SQL, ADMIN_PAGE_SIZE, adminPage, adminPeriod } from "../../../../../lib/admin-readonly";
import { authErrorResponse, requirePlatformAdmin } from "../../../../../lib/auth";

const num = (value: unknown) => Number(value) || 0;

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const params = new URL(request.url).searchParams;
    const scope = await resolveAdminAnalysisScope(params.get("userId"));
    if (!scope) return Response.json({ error: "Usuário não encontrado." }, { status: 404 });
    const period = adminPeriod(params.get("from"), params.get("to"));
    if (!period) return Response.json({ error: "Período inválido." }, { status: 400 });
    const section = params.get("section") === "campaigns" ? "campaigns" : params.get("section") === "queue" ? "queue" : "profiles";
    const page = adminPage(params.get("page"));
    const search = (params.get("q") || "").trim().toLowerCase().slice(0, 100);
    const literal = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    const allowedStatus = section === "profiles" ? ["all", "connected", "disconnected", "archived", "restricted"]
      : section === "queue" ? ["all", "pending", "overdue", "failed"] : ["all", "draft", "scheduled", "paused", "completed", "cancelled"];
    const status = allowedStatus.includes(params.get("status") || "all") ? params.get("status") || "all" : "all";
    const sort = ["recent", "name", "followers", "status"].includes(params.get("sort") || "recent") ? params.get("sort") || "recent" : "recent";
    const workspace = params.get("workspace") || "";
    if (workspace.length > 200 || workspace && scope.ownerIds !== null && !scope.ownerIds.includes(workspace)) {
      return Response.json({ error: "Workspace fora do escopo." }, { status: 400 });
    }
    const db = getDb();
    const ownerFilter = (owner: AnyColumn) => workspace ? eq(owner, workspace)
      : scope.ownerIds === null ? undefined : scope.ownerIds.length ? inArray(owner, scope.ownerIds) : sql`0 = 1`;
    const connected = sql.raw(ADMIN_CONNECTED_PROFILE_EXISTS_SQL);
    const periodPosts = and(eq(scheduledPosts.status, "published"),
      sql`${scheduledPosts.publishedAt} >= ${period.from}`, sql`${scheduledPosts.publishedAt} <= ${period.to}`);
    if (section === "profiles") {
      const statusFilter = status === "archived" ? sql`${accounts.archivedAt} is not null`
        : status === "connected" ? sql`${accounts.archivedAt} is null and ${connected}`
        : status === "disconnected" ? sql`${accounts.archivedAt} is null and not ${connected}`
        : status === "restricted" ? sql`${accounts.archivedAt} is null and (lower(${accounts.healthStatus}) like '%restr%' or lower(${accounts.healthStatus}) like '%susp%')`
        : undefined;
      const filter = and(ownerFilter(accounts.ownerUserId), statusFilter,
        search ? sql`(lower(${accounts.username}) like ${literal} escape '\\' or lower(${accounts.displayName}) like ${literal} escape '\\')` : undefined);
      const order = sort === "name" ? asc(accounts.username) : sort === "followers" ? desc(accounts.followersCount) : desc(accounts.createdAt);
      const [totalRows, rows] = await Promise.all([
        db.select({ total: sql<number>`count(*)` }).from(accounts).where(filter),
        db.select({ id: accounts.id, ownerUserId: accounts.ownerUserId, instagramAccountId: accounts.instagramAccountId,
          username: accounts.username, displayName: accounts.displayName, lifecycle: accounts.lifecycle,
          archivedAt: accounts.archivedAt, healthStatus: accounts.healthStatus, connectionStatus: accounts.connectionStatus,
          followers: accounts.followersCount, model: accounts.model, player: accounts.player,
          connected: sql<number>`case when ${connected} then 1 else 0 end` }).from(accounts).where(filter)
          .orderBy(order, asc(accounts.id)).limit(ADMIN_PAGE_SIZE).offset((page - 1) * ADMIN_PAGE_SIZE),
      ]);
      const ids = rows.map(row => row.id);
      const ownerIds = [...new Set(rows.map(row => row.ownerUserId))];
      const [stats, meta, workspaceRows] = ids.length ? await Promise.all([
        db.select({ id: scheduledPosts.accountId, posts: sql<number>`count(*)`, views: sql<number>`coalesce(sum(${scheduledPosts.mediaViews}),0)`,
          reach: sql<number>`coalesce(sum(${scheduledPosts.mediaReach}),0)` }).from(scheduledPosts)
          .where(and(periodPosts, inArray(scheduledPosts.accountId, ids), inArray(scheduledPosts.ownerUserId, ownerIds))).groupBy(scheduledPosts.accountId),
        db.select({ ownerUserId: metaConnections.ownerUserId, instagramUserId: metaConnections.instagramUserId,
          lastSyncAt: metaConnections.lastSyncAt }).from(metaConnections)
          .where(and(inArray(metaConnections.ownerUserId, ownerIds),
            inArray(metaConnections.instagramUserId, rows.flatMap(row => row.instagramAccountId ? [row.instagramAccountId] : [])),
            eq(metaConnections.status, "connected"))),
        db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces).where(inArray(workspaces.id, ownerIds)),
      ]) : [[], [], []];
      const statsById = new Map(stats.map(row => [row.id, row]));
      const metaByKey = new Map(meta.map(row => [`${row.ownerUserId}\u001f${row.instagramUserId}`, row]));
      const nameById = new Map(workspaceRows.map(row => [row.id, row.name]));
      return Response.json({ section, page, pageSize: ADMIN_PAGE_SIZE, total: num(totalRows[0]?.total),
        rows: rows.map(row => ({ id: row.id, ownerUserId: row.ownerUserId, workspaceName: nameById.get(row.ownerUserId) || "Workspace",
          username: row.username, displayName: row.displayName, lifecycle: row.lifecycle, archived: Boolean(row.archivedAt),
          healthStatus: row.healthStatus, connectionStatus: row.connectionStatus, connected: Boolean(row.connected),
          followers: num(row.followers), model: row.model, player: row.player,
          lastSyncAt: row.instagramAccountId ? metaByKey.get(`${row.ownerUserId}\u001f${row.instagramAccountId}`)?.lastSyncAt || null : null,
          posts: num(statsById.get(row.id)?.posts), views: num(statsById.get(row.id)?.views), reach: num(statsById.get(row.id)?.reach) })) },
      { headers: { "cache-control": "private, no-store" } });
    }
    if (section === "queue") {
      const queueStatuses = ["pending", "retry", "container_created", "processing"];
      const failureStatuses = ["failed", "blocked"];
      const statusFilter = status === "overdue" ? and(inArray(scheduledPosts.status, ["pending", "retry"]),
        sql`replace(${scheduledPosts.scheduledFor}, 'T', ' ') < datetime('now')`)
        : status === "pending" ? inArray(scheduledPosts.status, queueStatuses)
        : status === "failed" ? inArray(scheduledPosts.status, failureStatuses)
          : inArray(scheduledPosts.status, [...queueStatuses, ...failureStatuses]);
      const filter = and(ownerFilter(scheduledPosts.ownerUserId), statusFilter);
      const [totalRows, rows] = await Promise.all([
        db.select({ total: sql<number>`count(*)` }).from(scheduledPosts).where(filter),
        db.select({ id: scheduledPosts.id, ownerUserId: scheduledPosts.ownerUserId, accountId: scheduledPosts.accountId,
          campaignId: scheduledPosts.campaignId, status: scheduledPosts.status, scheduledFor: scheduledPosts.scheduledFor,
          updatedAt: scheduledPosts.updatedAt, attemptCount: scheduledPosts.attemptCount })
          .from(scheduledPosts).where(filter).orderBy(desc(scheduledPosts.scheduledFor), desc(scheduledPosts.id))
          .limit(ADMIN_PAGE_SIZE).offset((page - 1) * ADMIN_PAGE_SIZE),
      ]);
      const ownerIds = [...new Set(rows.map(row => row.ownerUserId))];
      const [accountRows, campaignRows, workspaceRows] = rows.length ? await Promise.all([
        db.select({ id: accounts.id, username: accounts.username }).from(accounts)
          .where(inArray(accounts.id, rows.map(row => row.accountId))),
        db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns)
          .where(inArray(campaigns.id, rows.map(row => row.campaignId))),
        db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces).where(inArray(workspaces.id, ownerIds)),
      ]) : [[], [], []];
      const accountById = new Map(accountRows.map(row => [row.id, row.username]));
      const campaignById = new Map(campaignRows.map(row => [row.id, row.name]));
      const workspaceById = new Map(workspaceRows.map(row => [row.id, row.name]));
      return Response.json({ section, page, pageSize: ADMIN_PAGE_SIZE, total: num(totalRows[0]?.total),
        rows: rows.map(row => ({ id: row.id, ownerUserId: row.ownerUserId,
          workspaceName: workspaceById.get(row.ownerUserId) || "Workspace", account: accountById.get(row.accountId) || "Perfil",
          campaign: campaignById.get(row.campaignId) || "Campanha", status: row.status,
          scheduledFor: row.scheduledFor, updatedAt: row.updatedAt, attemptCount: row.attemptCount })) },
      { headers: { "cache-control": "private, no-store" } });
    }
    const filter = and(ownerFilter(campaigns.ownerUserId), ne(campaigns.status, "template"),
      status !== "all" ? eq(campaigns.status, status) : undefined,
      search ? sql`lower(${campaigns.name}) like ${literal} escape '\\'` : undefined);
    const order = sort === "name" ? asc(campaigns.name) : sort === "status" ? asc(campaigns.status) : desc(campaigns.createdAt);
    const [totalRows, rows] = await Promise.all([
      db.select({ total: sql<number>`count(*)` }).from(campaigns).where(filter),
      db.select({ id: campaigns.id, ownerUserId: campaigns.ownerUserId, name: campaigns.name, status: campaigns.status,
        createdAt: campaigns.createdAt, startAt: campaigns.startAt, totalAccounts: campaigns.totalAccounts,
        intervalMinutes: campaigns.intervalMinutes, distributionMode: campaigns.distributionMode, mediaCount: campaigns.mediaCount })
        .from(campaigns).where(filter).orderBy(order, asc(campaigns.id))
        .limit(ADMIN_PAGE_SIZE).offset((page - 1) * ADMIN_PAGE_SIZE),
    ]);
    const ids = rows.map(row => row.id);
    const ownerIds = [...new Set(rows.map(row => row.ownerUserId))];
    const [stats, workspaceRows] = ids.length ? await Promise.all([
      db.select({ id: scheduledPosts.campaignId, posts: sql<number>`count(*)`, views: sql<number>`coalesce(sum(${scheduledPosts.mediaViews}),0)`,
        reach: sql<number>`coalesce(sum(${scheduledPosts.mediaReach}),0)` }).from(scheduledPosts)
        .where(and(periodPosts, inArray(scheduledPosts.campaignId, ids), inArray(scheduledPosts.ownerUserId, ownerIds)))
        .groupBy(scheduledPosts.campaignId),
      db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces).where(inArray(workspaces.id, ownerIds)),
    ]) : [[], []];
    const statsById = new Map(stats.map(row => [row.id, row]));
    const nameById = new Map(workspaceRows.map(row => [row.id, row.name]));
    return Response.json({ section, page, pageSize: ADMIN_PAGE_SIZE, total: num(totalRows[0]?.total),
      rows: rows.map(row => ({ ...row, workspaceName: nameById.get(row.ownerUserId) || "Workspace",
        posts: num(statsById.get(row.id)?.posts), views: num(statsById.get(row.id)?.views), reach: num(statsById.get(row.id)?.reach) })) },
    { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: "Não foi possível carregar a lista administrativa." }, { status: 500 });
  }
}
