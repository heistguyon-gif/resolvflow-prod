import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accounts, appUsers, metaConnections, otpWallets, scheduledPosts, workspaceMembers, workspaces } from "../../../../db/schema";
import { authErrorResponse, requirePlatformAdmin } from "../../../../lib/auth";

const PAGE_SIZE = 24;
const number = (value: unknown) => Number(value) || 0;

export async function GET(request: Request) {
  try {
    const admin = await requirePlatformAdmin(request);
    const params = new URL(request.url).searchParams;
    const query = (params.get("q") || "").trim().slice(0, 100).toLowerCase();
    const status = params.get("status") === "active" ? "active" : params.get("status") === "inactive" ? "inactive" : "all";
    const page = Math.min(10000, Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1));
    const from = params.get("from") || new Date(Date.now() - 30 * 86400000).toISOString();
    const to = params.get("to") || new Date().toISOString();
    const fromDate = new Date(from), toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
      return Response.json({ error: "Período inválido." }, { status: 400 });
    }

    const db = getDb();
    const conditions = [];
    if (query) {
      const literal = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
      conditions.push(sql`(lower(${appUsers.displayName}) LIKE ${literal} ESCAPE '\' OR lower(${appUsers.email}) LIKE ${literal} ESCAPE '\')`);
    }
    if (status === "active") conditions.push(eq(appUsers.status, "active"));
    if (status === "inactive") conditions.push(sql`${appUsers.status} <> 'active'`);
    const filter = conditions.length ? and(...conditions) : undefined;
    const [countRows, userRows] = await Promise.all([
      db.select({ total: sql<number>`count(*)` }).from(appUsers).where(filter),
      db.select({ id: appUsers.id, displayName: appUsers.displayName, email: appUsers.email, status: appUsers.status,
        mustChangePassword: appUsers.mustChangePassword, lastLoginAt: appUsers.lastLoginAt, createdAt: appUsers.createdAt })
        .from(appUsers).where(filter).orderBy(desc(appUsers.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    ]);
    if (!userRows.length) return Response.json({ users: [], total: number(countRows[0]?.total), page, pageSize: PAGE_SIZE }, { headers: { "cache-control": "private, no-store" } });

    const userIds = userRows.map((user) => user.id);
    const emails = userRows.map((user) => user.email);
    const members = await db.select({ accountUserId: workspaceMembers.accountUserId, email: workspaceMembers.email,
      role: workspaceMembers.role, status: workspaceMembers.status, workspaceOwnerUserId: workspaceMembers.workspaceOwnerUserId,
      workspaceName: workspaces.name, workspaceStatus: workspaces.status })
      .from(workspaceMembers).leftJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceOwnerUserId))
      .where(or(inArray(workspaceMembers.accountUserId, userIds), inArray(workspaceMembers.email, emails)));
    const workspaceIds = [...new Set(members.map((member) => member.workspaceOwnerUserId))];
    const [accountRows, connectionRows, postRows, walletRows] = workspaceIds.length ? await Promise.all([
      db.select({ ownerUserId: accounts.ownerUserId, total: sql<number>`count(*)`,
        active: sql<number>`sum(case when ${accounts.lifecycle} = 'ativa' then 1 else 0 end)` })
        .from(accounts).where(inArray(accounts.ownerUserId, workspaceIds)).groupBy(accounts.ownerUserId),
      db.select({ ownerUserId: metaConnections.ownerUserId, connected: sql<number>`sum(case when ${metaConnections.status} = 'connected' then 1 else 0 end)` })
        .from(metaConnections).where(inArray(metaConnections.ownerUserId, workspaceIds)).groupBy(metaConnections.ownerUserId),
      db.select({ ownerUserId: scheduledPosts.ownerUserId, published: sql<number>`count(*)`,
        views: sql<number>`coalesce(sum(${scheduledPosts.mediaViews}), 0)`, reach: sql<number>`coalesce(sum(${scheduledPosts.mediaReach}), 0)` })
        .from(scheduledPosts).where(and(inArray(scheduledPosts.ownerUserId, workspaceIds), eq(scheduledPosts.status, "published"),
          sql`${scheduledPosts.publishedAt} >= ${fromDate.toISOString()}`, sql`${scheduledPosts.publishedAt} <= ${toDate.toISOString()}`))
        .groupBy(scheduledPosts.ownerUserId),
      db.select({ workspaceOwnerUserId: otpWallets.workspaceOwnerUserId, balanceCents: otpWallets.balanceCents,
        billingMode: otpWallets.billingMode }).from(otpWallets).where(inArray(otpWallets.workspaceOwnerUserId, workspaceIds)),
    ]) : [[], [], [], []];
    const accountsById = new Map(accountRows.map((row) => [row.ownerUserId, row]));
    const connectionsById = new Map(connectionRows.map((row) => [row.ownerUserId, row]));
    const postsById = new Map(postRows.map((row) => [row.ownerUserId, row]));
    const walletsById = new Map(walletRows.map((row) => [row.workspaceOwnerUserId, row]));
    const users = userRows.map((user) => ({
      ...user,
      isPlatformAdmin: user.email.toLowerCase() === admin.email.toLowerCase(),
      memberships: members.filter((member) => member.accountUserId === user.id || member.email.toLowerCase() === user.email.toLowerCase())
        .map((member) => {
          const id = member.workspaceOwnerUserId;
          const wallet = walletsById.get(id);
          return { workspaceOwnerUserId: id, workspaceName: member.workspaceName || "Operação", workspaceStatus: member.workspaceStatus || "unknown",
            role: member.role, status: member.status, accounts: number(accountsById.get(id)?.total),
            activeAccounts: number(accountsById.get(id)?.active), connected: number(connectionsById.get(id)?.connected),
            published: number(postsById.get(id)?.published), views: number(postsById.get(id)?.views), reach: number(postsById.get(id)?.reach),
            walletBalanceCents: wallet ? number(wallet.balanceCents) : 0, billingMode: wallet?.billingMode || null };
        }),
    }));
    return Response.json({ users, total: number(countRows[0]?.total), page, pageSize: PAGE_SIZE }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar os usuários." }, { status: 500 });
  }
}
