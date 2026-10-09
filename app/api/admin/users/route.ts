import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accounts, appUsers, metaAppAssignments, metaApps, metaAppUserPolicies, metaConnectionModes, otpInbox, otpSupplierApis, otpWallets, scheduledPosts, workspaceMembers, workspaceMetaApps, workspaces } from "../../../../db/schema";
import { authErrorResponse, isPlatformAdminEmail, requirePlatformAdmin } from "../../../../lib/auth";
import { ADMIN_CONNECTED_PROFILE_COUNT_SQL } from "../../../../lib/admin-readonly";
import { belongsToDirectoryUser } from "../../../../lib/admin-user-membership";
import { usesOtpSupplierBalance } from "../../../../lib/otp-billing";
import { resolveOtpSupplierMode } from "../../../../lib/otp-mode";
import { metaAppKeysForWorkspace, metaAppLabel, metaConfig } from "../../../../lib/runtime-env";

const DEFAULT_PAGE_SIZE = 50;
const ALLOWED_PAGE_SIZES = new Set([25, 50, 100]);
const number = (value: unknown) => Number(value) || 0;

export async function GET(request: Request) {
  try {
    const admin = await requirePlatformAdmin(request);
    const params = new URL(request.url).searchParams;
    const query = (params.get("q") || "").trim().slice(0, 254).toLowerCase();
    const status = params.get("status") === "active" ? "active" : params.get("status") === "inactive" ? "inactive" : "all";
    const page = Math.min(10000, Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1));
    const requestedPageSize = Number(params.get("pageSize"));
    const pageSize = ALLOWED_PAGE_SIZES.has(requestedPageSize) ? requestedPageSize : DEFAULT_PAGE_SIZE;
    const from = params.get("from") || new Date(Date.now() - 30 * 86400000).toISOString();
    const to = params.get("to") || new Date().toISOString();
    const fromDate = new Date(from), toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
      return Response.json({ error: "Período inválido." }, { status: 400 });
    }

    const db = getDb();
    const conditions = [];
    if (query) {
      conditions.push(sql`(instr(lower(${appUsers.displayName}), ${query}) > 0 OR instr(lower(${appUsers.email}), ${query}) > 0)`);
    }
    if (status === "active") conditions.push(eq(appUsers.status, "active"));
    if (status === "inactive") conditions.push(sql`${appUsers.status} <> 'active'`);
    const filter = conditions.length ? and(...conditions) : undefined;
    const [countRows, userRows] = await Promise.all([
      db.select({ total: sql<number>`count(*)` }).from(appUsers).where(filter),
      db.select({ id: appUsers.id, displayName: appUsers.displayName, email: appUsers.email, status: appUsers.status,
        mustChangePassword: appUsers.mustChangePassword, lastLoginAt: appUsers.lastLoginAt, createdAt: appUsers.createdAt })
        .from(appUsers).where(filter).orderBy(desc(appUsers.createdAt), desc(appUsers.id)).limit(pageSize).offset((page - 1) * pageSize),
    ]);
    if (!userRows.length) return Response.json({ users: [], total: number(countRows[0]?.total), page, pageSize }, { headers: { "cache-control": "private, no-store" } });

    const userIds = userRows.map((user) => user.id);
    const emails = userRows.map((user) => user.email.toLowerCase());
    const members = await db.select({ accountUserId: workspaceMembers.accountUserId, email: workspaceMembers.email,
      role: workspaceMembers.role, status: workspaceMembers.status, workspaceOwnerUserId: workspaceMembers.workspaceOwnerUserId,
      workspaceName: workspaces.name, workspaceStatus: workspaces.status })
      .from(workspaceMembers).leftJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceOwnerUserId))
      .where(or(inArray(workspaceMembers.accountUserId, userIds),
        and(isNull(workspaceMembers.accountUserId), inArray(sql<string>`lower(${workspaceMembers.email})`, emails))));
    const workspaceIds = [...new Set(members.map((member) => member.workspaceOwnerUserId))];
    const [accountRows, postRows, walletRows, otpApiRows, openOrderRows, assignedAppRows, managedRows, dedicatedRows, modeRows] = workspaceIds.length ? await Promise.all([
      db.select({ ownerUserId: accounts.ownerUserId, total: sql<number>`count(*)`,
        active: sql<number>`sum(case when ${accounts.lifecycle} = 'ativa' then 1 else 0 end)`,
        connected: sql<number>`${sql.raw(ADMIN_CONNECTED_PROFILE_COUNT_SQL)}` })
        .from(accounts).where(inArray(accounts.ownerUserId, workspaceIds)).groupBy(accounts.ownerUserId),
      db.select({ ownerUserId: scheduledPosts.ownerUserId, published: sql<number>`count(*)`,
        views: sql<number>`coalesce(sum(${scheduledPosts.mediaViews}), 0)`, reach: sql<number>`coalesce(sum(${scheduledPosts.mediaReach}), 0)` })
        .from(scheduledPosts).where(and(inArray(scheduledPosts.ownerUserId, workspaceIds), eq(scheduledPosts.status, "published"),
          sql`${scheduledPosts.publishedAt} >= ${fromDate.toISOString()}`, sql`${scheduledPosts.publishedAt} <= ${toDate.toISOString()}`))
        .groupBy(scheduledPosts.ownerUserId),
      db.select({ workspaceOwnerUserId: otpWallets.workspaceOwnerUserId, balanceCents: otpWallets.balanceCents,
        billingMode: otpWallets.billingMode }).from(otpWallets).where(inArray(otpWallets.workspaceOwnerUserId, workspaceIds)),
      db.select({ workspaceOwnerUserId: otpSupplierApis.workspaceOwnerUserId, total: sql<number>`count(*)`,
        enabled: sql<number>`sum(case when ${otpSupplierApis.enabled} = 1 then 1 else 0 end)` })
        .from(otpSupplierApis).where(and(inArray(otpSupplierApis.workspaceOwnerUserId, workspaceIds),
          sql`${otpSupplierApis.deletedAt} is null`)).groupBy(otpSupplierApis.workspaceOwnerUserId),
      db.select({ accountUserId: otpInbox.accountUserId, workspaceOwnerUserId: otpInbox.workspaceOwnerUserId,
        total: sql<number>`count(*)` }).from(otpInbox)
        .where(and(inArray(otpInbox.accountUserId, userIds), inArray(otpInbox.workspaceOwnerUserId, workspaceIds),
          eq(otpInbox.closed, 0))).groupBy(otpInbox.accountUserId, otpInbox.workspaceOwnerUserId),
      db.select({ accountUserId: metaAppAssignments.accountUserId,
        workspaceOwnerUserId: metaAppAssignments.workspaceOwnerUserId,
        id: metaApps.id, label: metaApps.label, status: metaApps.status, appId: metaApps.appId })
        .from(metaAppAssignments).innerJoin(metaApps, eq(metaApps.id, metaAppAssignments.metaAppId))
        .where(and(inArray(metaAppAssignments.accountUserId, userIds),
          inArray(metaAppAssignments.workspaceOwnerUserId, workspaceIds), eq(metaAppAssignments.status, "active"))),
      db.select({ accountUserId: metaAppUserPolicies.accountUserId,
        workspaceOwnerUserId: metaAppUserPolicies.workspaceOwnerUserId }).from(metaAppUserPolicies)
        .where(and(inArray(metaAppUserPolicies.accountUserId, userIds),
          inArray(metaAppUserPolicies.workspaceOwnerUserId, workspaceIds))),
      db.select({ workspaceOwnerUserId: workspaceMetaApps.workspaceOwnerUserId }).from(workspaceMetaApps)
        .where(inArray(workspaceMetaApps.workspaceOwnerUserId, workspaceIds)),
      db.select({ accountUserId: metaConnectionModes.accountUserId, workspaceOwnerUserId: metaConnectionModes.workspaceOwnerUserId,
        mode: metaConnectionModes.mode }).from(metaConnectionModes).where(and(inArray(metaConnectionModes.accountUserId, userIds),
          inArray(metaConnectionModes.workspaceOwnerUserId, workspaceIds))),
    ]) : [[], [], [], [], [], [], [], [], []];
    const accountsById = new Map(accountRows.map((row) => [row.ownerUserId, row]));
    const postsById = new Map(postRows.map((row) => [row.ownerUserId, row]));
    const walletsById = new Map(walletRows.map((row) => [row.workspaceOwnerUserId, row]));
    const otpApisById = new Map(otpApiRows.map((row) => [row.workspaceOwnerUserId, row]));
    const openByTarget = new Map(openOrderRows.map((row) => [`${row.accountUserId}\u001f${row.workspaceOwnerUserId}`, number(row.total)]));
    const managedTargets = new Set(managedRows.map((row) => `${row.accountUserId}\u001f${row.workspaceOwnerUserId}`));
    const dedicatedWorkspaces = new Set(dedicatedRows.map((row) => row.workspaceOwnerUserId));
    const botTargets = new Set(modeRows.filter((row) => row.mode === "bot").map((row) => `${row.accountUserId}\u001f${row.workspaceOwnerUserId}`));
    const users = userRows.map((user) => ({
      ...user,
      isPlatformAdmin: isPlatformAdminEmail(user.email),
      memberships: members.filter((member) => belongsToDirectoryUser(member, user))
        .map((member) => {
          const id = member.workspaceOwnerUserId;
          const wallet = walletsById.get(id);
          const assigned = assignedAppRows.filter((row) => row.accountUserId === user.id && row.workspaceOwnerUserId === id)
            .map((row) => ({ id: row.id, label: row.label, status: row.status, configured: row.status === "active" && Boolean(row.appId) }));
          const managed = managedTargets.has(`${user.id}\u001f${id}`) || dedicatedWorkspaces.has(id);
          const visibleApps = managed ? assigned : metaAppKeysForWorkspace(id, user.email.toLowerCase() === admin.email.toLowerCase())
            .map((key) => ({ id: key, label: metaAppLabel(key), status: "legacy",
              configured: metaConfig(key).configured }));
          return { workspaceOwnerUserId: id, workspaceName: member.workspaceName || "Operação", workspaceStatus: member.workspaceStatus || "unknown",
            role: member.role, status: member.status, accounts: number(accountsById.get(id)?.total),
            activeAccounts: number(accountsById.get(id)?.active), connected: number(accountsById.get(id)?.connected),
            published: number(postsById.get(id)?.published), views: number(postsById.get(id)?.views), reach: number(postsById.get(id)?.reach),
            walletBalanceCents: wallet ? number(wallet.balanceCents) : 0,
            billingMode: resolveOtpSupplierMode(wallet?.billingMode || null, usesOtpSupplierBalance(user.email)) ? "supplier" : "platform",
            otpApisCount: number(otpApisById.get(id)?.total), otpEnabledApisCount: number(otpApisById.get(id)?.enabled),
            otpOpenOrders: openByTarget.get(`${user.id}\u001f${id}`) || 0,
            metaApps: visibleApps, metaAccessMode: managed ? "catalog" : "legacy",
            connectionMode: botTargets.has(`${user.id}\u001f${id}`) ? "bot" : "standard" };
        }),
    }));
    return Response.json({ users, total: number(countRows[0]?.total), page, pageSize }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar os usuários." }, { status: 500 });
  }
}
