import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accounts, campaigns, metaConnections, scheduledPosts, workspaces } from "../../../../db/schema";
import { authErrorResponse, requirePlatformAdmin } from "../../../../lib/auth";
import { ADMIN_CONNECTED_PROFILE_COUNT_SQL, ADMIN_CONNECTED_PROFILE_EXISTS_SQL, ADMIN_PAGE_SIZE, adminPage, adminPeriod } from "../../../../lib/admin-readonly";

const count = (value: unknown) => Number(value) || 0;

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const params = new URL(request.url).searchParams;
    const owner = params.get("workspaceOwnerUserId")?.trim() || "";
    if (!owner || owner.length > 200) return Response.json({ error: "Workspace inválido." }, { status: 400 });
    const period = adminPeriod(params.get("from"), params.get("to"));
    if (!period) {
      return Response.json({ error: "Período inválido." }, { status: 400 });
    }
    const section = params.get("section") === "campaigns" ? "campaigns" : "profiles";
    const page = adminPage(params.get("page"));
    const query = (params.get("q") || "").trim().slice(0, 100);
    const requestedStatus = params.get("status") || "all";
    const status = (section === "profiles" ? ["all", "connected", "disconnected", "archived"] : ["all", "draft", "scheduled", "paused", "completed", "cancelled"])
      .includes(requestedStatus) ? requestedStatus : "all";
    const sort = params.get("sort") || "recent";
    const db = getDb();
    const [workspace] = await db.select({ id: workspaces.id, name: workspaces.name, status: workspaces.status })
      .from(workspaces).where(eq(workspaces.id, owner)).limit(1);
    if (!workspace) return Response.json({ error: "Workspace não encontrado." }, { status: 404 });

    const windowFilter = and(eq(scheduledPosts.ownerUserId, owner), eq(scheduledPosts.status, "published"),
      sql`${scheduledPosts.publishedAt} >= ${period.from}`, sql`${scheduledPosts.publishedAt} <= ${period.to}`);
    const connectedProfile = sql.raw(ADMIN_CONNECTED_PROFILE_EXISTS_SQL);
    const [accountTotals, connectionTotals, campaignTotals, performance, queue] = await Promise.all([
      db.select({ total: sql<number>`count(*)`, archived: sql<number>`sum(case when ${accounts.archivedAt} is not null then 1 else 0 end)`,
        connected: sql<number>`${sql.raw(ADMIN_CONNECTED_PROFILE_COUNT_SQL)}` })
        .from(accounts).where(eq(accounts.ownerUserId, owner)),
      db.select({ total: sql<number>`count(*)` })
        .from(metaConnections).where(eq(metaConnections.ownerUserId, owner)),
      db.select({ total: sql<number>`count(*)`, scheduled: sql<number>`sum(case when ${campaigns.status} = 'scheduled' then 1 else 0 end)` })
        .from(campaigns).where(and(eq(campaigns.ownerUserId, owner), ne(campaigns.status, "template"))),
      db.select({ published: sql<number>`count(*)`, views: sql<number>`coalesce(sum(${scheduledPosts.mediaViews}), 0)`, reach: sql<number>`coalesce(sum(${scheduledPosts.mediaReach}), 0)` })
        .from(scheduledPosts).where(windowFilter),
      db.select({ pending: sql<number>`sum(case when ${scheduledPosts.status} in ('pending','retry','container_created','processing') then 1 else 0 end)`, failed: sql<number>`sum(case when ${scheduledPosts.status} in ('failed','blocked') then 1 else 0 end)` })
        .from(scheduledPosts).where(eq(scheduledPosts.ownerUserId, owner)),
    ]);

    const base = {
      workspace,
      period,
      totals: { registeredAccounts: count(accountTotals[0]?.total), archivedAccounts: count(accountTotals[0]?.archived),
        metaConnections: count(connectionTotals[0]?.total), connectedProfiles: count(accountTotals[0]?.connected),
        campaigns: count(campaignTotals[0]?.total), scheduledCampaigns: count(campaignTotals[0]?.scheduled),
        published: count(performance[0]?.published), views: count(performance[0]?.views), reach: count(performance[0]?.reach),
        pending: count(queue[0]?.pending), failed: count(queue[0]?.failed) },
    };
    if (section === "profiles") {
      const profileStatus = status === "archived" ? sql`${accounts.archivedAt} is not null`
        : status === "connected" ? sql`${accounts.archivedAt} is null and ${connectedProfile}`
        : status === "disconnected" ? sql`${accounts.archivedAt} is null and not ${connectedProfile}`
        : undefined;
      const filter = and(eq(accounts.ownerUserId, owner), profileStatus,
        query ? sql`lower(${accounts.username}) LIKE ${`%${query.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`} ESCAPE '\\'` : undefined);
      const [totalRows, rows] = await Promise.all([
        db.select({ total: sql<number>`count(*)` }).from(accounts).where(filter),
        db.select({ id: accounts.id, username: accounts.username, displayName: accounts.displayName,
          lifecycle: accounts.lifecycle, archivedAt: accounts.archivedAt, healthStatus: accounts.healthStatus,
          connectionStatus: accounts.connectionStatus, followers: accounts.followersCount,
          connected: sql<number>`case when ${connectedProfile} then 1 else 0 end` })
          .from(accounts).where(filter).orderBy(sort === "name" ? asc(accounts.username) : desc(accounts.createdAt))
          .limit(ADMIN_PAGE_SIZE).offset((page - 1) * ADMIN_PAGE_SIZE),
      ]);
      return Response.json({ ...base, section, rows: rows.map(row => ({ ...row, connected: Boolean(row.connected) })),
        total: count(totalRows[0]?.total), page, pageSize: ADMIN_PAGE_SIZE }, { headers: { "cache-control": "private, no-store" } });
    }
    const filter = and(eq(campaigns.ownerUserId, owner), ne(campaigns.status, "template"),
      status !== "all" ? eq(campaigns.status, status) : undefined,
      query ? sql`lower(${campaigns.name}) LIKE ${`%${query.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`} ESCAPE '\\'` : undefined);
    const [totalRows, rows] = await Promise.all([
      db.select({ total: sql<number>`count(*)` }).from(campaigns).where(filter),
      db.select({ id: campaigns.id, name: campaigns.name, status: campaigns.status, createdAt: campaigns.createdAt,
        totalAccounts: campaigns.totalAccounts }).from(campaigns).where(filter)
        .orderBy(sort === "name" ? asc(campaigns.name) : desc(campaigns.createdAt))
        .limit(ADMIN_PAGE_SIZE).offset((page - 1) * ADMIN_PAGE_SIZE),
    ]);
    const stats = rows.length ? await db.select({ campaignId: scheduledPosts.campaignId, published: sql<number>`count(*)`,
      views: sql<number>`coalesce(sum(${scheduledPosts.mediaViews}), 0)`, reach: sql<number>`coalesce(sum(${scheduledPosts.mediaReach}), 0)` })
      .from(scheduledPosts).where(and(windowFilter, inArray(scheduledPosts.campaignId, rows.map(row => row.id))))
      .groupBy(scheduledPosts.campaignId) : [];
    const statsById = new Map(stats.map(row => [row.campaignId, row]));
    return Response.json({ ...base, section, rows: rows.map(row => ({ ...row, published: count(statsById.get(row.id)?.published),
      views: count(statsById.get(row.id)?.views), reach: count(statsById.get(row.id)?.reach) })),
      total: count(totalRows[0]?.total), page, pageSize: ADMIN_PAGE_SIZE }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: "Não foi possível carregar a operação." }, { status: 500 });
  }
}
