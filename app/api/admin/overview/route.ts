import { desc, ne, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import {
  accounts,
  appUsers,
  auditEvents,
  campaignMedia,
  campaigns,
  metaConnections,
  scheduledPosts,
  sharkbotEvents,
  systemHealth,
  workspaceMembers,
  workspaces,
} from "../../../../db/schema";
import { authErrorResponse, requirePlatformAdmin } from "../../../../lib/auth";
import { ADMIN_CONNECTED_PROFILE_GLOBAL_COUNT_SQL } from "../../../../lib/admin-readonly";
import { runtimeEnv } from "../../../../lib/runtime-env";

function number(value: unknown) {
  return Number(value) || 0;
}

export async function GET(request: Request) {
  try {
    const context = await requirePlatformAdmin(request);
    const db = getDb();
    const url = new URL(request.url);
    const defaultTo = new Date();
    const defaultFrom = new Date(defaultTo.getTime() - 30 * 86_400_000);
    const requestedFrom = new Date(url.searchParams.get("from") || defaultFrom.toISOString());
    const requestedTo = new Date(url.searchParams.get("to") || defaultTo.toISOString());
    const periodStart = Number.isNaN(requestedFrom.getTime()) ? defaultFrom.toISOString() : requestedFrom.toISOString();
    const periodEnd = Number.isNaN(requestedTo.getTime()) ? defaultTo.toISOString() : requestedTo.toISOString();
    const [
      userRows,
      memberRows,
      workspaceRows,
      userTotals,
      workspaceTotals,
      accountTotals,
      accountsByOwner,
      campaignTotals,
      postTotals,
      postsByOwner,
      mediaTotals,
      connectionTotals,
      sharkbotTotals,
      sharkbotRows,
      sharkbotBreakdownRows,
      health,
      audit,
    ] = await Promise.all([
      db.select({
        id: appUsers.id,
        email: appUsers.email,
        displayName: appUsers.displayName,
        status: appUsers.status,
        mustChangePassword: appUsers.mustChangePassword,
        lastLoginAt: appUsers.lastLoginAt,
        createdAt: appUsers.createdAt,
      }).from(appUsers).orderBy(desc(appUsers.createdAt)).limit(250),
      db.select({
        accountUserId: workspaceMembers.accountUserId,
        email: workspaceMembers.email,
        displayName: workspaceMembers.displayName,
        role: workspaceMembers.role,
        status: workspaceMembers.status,
        workspaceOwnerUserId: workspaceMembers.workspaceOwnerUserId,
      }).from(workspaceMembers).limit(500),
      db.select({ id: workspaces.id, name: workspaces.name, status: workspaces.status, metaAppKey: workspaces.metaAppKey }).from(workspaces).limit(250),
      db.select({ total: sql<number>`count(*)`, active: sql<number>`sum(case when ${appUsers.status} = 'active' then 1 else 0 end)` }).from(appUsers),
      db.select({ total: sql<number>`count(*)`, active: sql<number>`sum(case when ${workspaces.status} = 'active' then 1 else 0 end)` }).from(workspaces),
      db.select({ total: sql<number>`count(*)`, active: sql<number>`sum(case when ${accounts.lifecycle} = 'ativa' then 1 else 0 end)`, followers: sql<number>`coalesce(sum(${accounts.followersCount}), 0)`,
        connected: sql<number>`${sql.raw(ADMIN_CONNECTED_PROFILE_GLOBAL_COUNT_SQL)}` }).from(accounts),
      db.select({ ownerUserId: accounts.ownerUserId, accounts: sql<number>`count(*)`, followers: sql<number>`coalesce(sum(${accounts.followersCount}), 0)` }).from(accounts).groupBy(accounts.ownerUserId),
      db.select({ total: sql<number>`count(*)`, running: sql<number>`sum(case when ${campaigns.status} = 'scheduled' then 1 else 0 end)` }).from(campaigns).where(ne(campaigns.status, "template")),
      db.select({
        total: sql<number>`count(*)`,
        published: sql<number>`sum(case when ${scheduledPosts.status} = 'published' then 1 else 0 end)`,
        published30d: sql<number>`sum(case when ${scheduledPosts.status} = 'published' and ${scheduledPosts.publishedAt} >= ${periodStart} and ${scheduledPosts.publishedAt} <= ${periodEnd} then 1 else 0 end)`,
        views30d: sql<number>`coalesce(sum(case when ${scheduledPosts.status} = 'published' and ${scheduledPosts.publishedAt} >= ${periodStart} and ${scheduledPosts.publishedAt} <= ${periodEnd} then ${scheduledPosts.mediaViews} else 0 end), 0)`,
        reach30d: sql<number>`coalesce(sum(case when ${scheduledPosts.status} = 'published' and ${scheduledPosts.publishedAt} >= ${periodStart} and ${scheduledPosts.publishedAt} <= ${periodEnd} then ${scheduledPosts.mediaReach} else 0 end), 0)`,
        pending: sql<number>`sum(case when ${scheduledPosts.status} in ('pending','retry','container_created','processing') then 1 else 0 end)`,
        failed: sql<number>`sum(case when ${scheduledPosts.status} in ('failed','blocked') then 1 else 0 end)`,
      }).from(scheduledPosts),
      db.select({
        ownerUserId: scheduledPosts.ownerUserId,
        published: sql<number>`count(*)`,
        views: sql<number>`coalesce(sum(${scheduledPosts.mediaViews}), 0)`,
        reach: sql<number>`coalesce(sum(${scheduledPosts.mediaReach}), 0)`,
      }).from(scheduledPosts).where(sql`${scheduledPosts.status} = 'published' and ${scheduledPosts.publishedAt} >= ${periodStart} and ${scheduledPosts.publishedAt} <= ${periodEnd}`).groupBy(scheduledPosts.ownerUserId),
      db.select({ objects: sql<number>`count(*)`, bytes: sql<number>`coalesce(sum(${campaignMedia.sizeBytes}), 0)` }).from(campaignMedia),
      db.select({ total: sql<number>`count(*)` }).from(metaConnections),
      db.select({
        events: sql<number>`count(*)`,
        leads: sql<number>`sum(case when ${sharkbotEvents.eventType} = 'new_lead' then 1 else 0 end)`,
        created: sql<number>`sum(case when ${sharkbotEvents.eventType} = 'payment_created' then 1 else 0 end)`,
        approved: sql<number>`sum(case when ${sharkbotEvents.eventType} = 'payment_approved' then 1 else 0 end)`,
        revenueCents: sql<number>`coalesce(sum(case when ${sharkbotEvents.eventType} = 'payment_approved' then ${sharkbotEvents.amountCents} else 0 end), 0)`,
      }).from(sharkbotEvents).where(sql`${sharkbotEvents.occurredAt} >= ${periodStart} and ${sharkbotEvents.occurredAt} <= ${periodEnd}`),
      db.select({
        id: sharkbotEvents.id, eventType: sharkbotEvents.eventType, paymentId: sharkbotEvents.paymentId,
        status: sharkbotEvents.status, amountCents: sharkbotEvents.amountCents, currency: sharkbotEvents.currency,
        payerName: sharkbotEvents.payerName, productName: sharkbotEvents.productName, botName: sharkbotEvents.botName,
        flowName: sharkbotEvents.flowName, gateway: sharkbotEvents.gateway, occurredAt: sharkbotEvents.occurredAt,
      }).from(sharkbotEvents).where(sql`${sharkbotEvents.occurredAt} >= ${periodStart} and ${sharkbotEvents.occurredAt} <= ${periodEnd}`).orderBy(desc(sharkbotEvents.occurredAt)).limit(100),
      db.select({
        botName: sharkbotEvents.botName, flowName: sharkbotEvents.flowName, gateway: sharkbotEvents.gateway,
        leads: sql<number>`sum(case when ${sharkbotEvents.eventType} = 'new_lead' then 1 else 0 end)`,
        created: sql<number>`sum(case when ${sharkbotEvents.eventType} = 'payment_created' then 1 else 0 end)`,
        approved: sql<number>`sum(case when ${sharkbotEvents.eventType} = 'payment_approved' then 1 else 0 end)`,
        revenueCents: sql<number>`coalesce(sum(case when ${sharkbotEvents.eventType} = 'payment_approved' then ${sharkbotEvents.amountCents} else 0 end), 0)`,
      }).from(sharkbotEvents).where(sql`${sharkbotEvents.occurredAt} >= ${periodStart} and ${sharkbotEvents.occurredAt} <= ${periodEnd}`).groupBy(sharkbotEvents.botName, sharkbotEvents.flowName, sharkbotEvents.gateway),
      db.select().from(systemHealth).orderBy(desc(systemHealth.updatedAt)),
      db.select({ id: auditEvents.id, actorEmail: auditEvents.actorEmail, action: auditEvents.action, summary: auditEvents.summary, createdAt: auditEvents.createdAt }).from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(24),
    ]);

    const workspaceById = new Map(workspaceRows.map((workspace) => [workspace.id, workspace]));
    const membershipByUser = new Map<string, typeof memberRows>();
    for (const member of memberRows) {
      const key = member.accountUserId || member.email.toLowerCase();
      membershipByUser.set(key, [...(membershipByUser.get(key) || []), member]);
    }
    const users = userRows.map((user) => {
      const memberships = membershipByUser.get(user.id) || membershipByUser.get(user.email.toLowerCase()) || [];
      return {
        ...user,
        isPlatformAdmin: user.email.toLowerCase() === context.email.toLowerCase(),
        memberships: memberships.map((member) => ({
          role: member.role,
          status: member.status,
          workspaceOwnerUserId: member.workspaceOwnerUserId,
          workspaceName: workspaceById.get(member.workspaceOwnerUserId)?.name || "Operação",
        })),
      };
    });
    const accountsMap = new Map(accountsByOwner.map((item) => [item.ownerUserId, item]));
    const postsMap = new Map(postsByOwner.map((item) => [item.ownerUserId, item]));
    const ownerIds = new Set([...accountsMap.keys(), ...postsMap.keys()]);
    const userById = new Map(userRows.map((user) => [user.id, user]));
    const ranking = [...ownerIds].map((ownerUserId) => {
      const member = memberRows.find((item) => item.workspaceOwnerUserId === ownerUserId && item.role === "owner")
        || memberRows.find((item) => item.workspaceOwnerUserId === ownerUserId);
      const user = member?.accountUserId ? userById.get(member.accountUserId) : undefined;
      const account = accountsMap.get(ownerUserId);
      const post = postsMap.get(ownerUserId);
      return {
        ownerUserId,
        displayName: user?.displayName || member?.displayName || member?.email || workspaceById.get(ownerUserId)?.name || "Operação",
        email: user?.email || member?.email || null,
        workspaceName: workspaceById.get(ownerUserId)?.name || "Operação",
        accounts: number(account?.accounts),
        followers: number(account?.followers),
        published: number(post?.published),
        views: number(post?.views),
        reach: number(post?.reach),
      };
    }).sort((left, right) => right.published - left.published || right.views - left.views);

    return Response.json({
      checkedAt: new Date().toISOString(),
      platform: {
        provider: "Cloudflare",
        runtime: "Workers",
        database: "D1 · nexoflow-operacao-mk-db",
        storage: "R2 · nexoflow-operacao-mk-media",
        scheduler: "Cron · a cada minuto",
        primaryDomain: "resolvflow.online",
        adminDomain: "top.resolvflow.online",
      },
      totals: {
        users: number(userTotals[0]?.total), activeUsers: number(userTotals[0]?.active),
        workspaces: number(workspaceTotals[0]?.total), activeWorkspaces: number(workspaceTotals[0]?.active),
        accounts: number(accountTotals[0]?.total), activeAccounts: number(accountTotals[0]?.active), followers: number(accountTotals[0]?.followers),
        campaigns: number(campaignTotals[0]?.total), runningCampaigns: number(campaignTotals[0]?.running),
        posts: number(postTotals[0]?.total), published: number(postTotals[0]?.published), published30d: number(postTotals[0]?.published30d), views30d: number(postTotals[0]?.views30d), reach30d: number(postTotals[0]?.reach30d), pending: number(postTotals[0]?.pending), failed: number(postTotals[0]?.failed),
        mediaObjects: number(mediaTotals[0]?.objects), mediaBytes: number(mediaTotals[0]?.bytes),
        connections: number(connectionTotals[0]?.total), connected: number(accountTotals[0]?.connected),
        sharkbotEvents: number(sharkbotTotals[0]?.events), sharkbotLeads: number(sharkbotTotals[0]?.leads),
        sharkbotCreated: number(sharkbotTotals[0]?.created), sharkbotApproved: number(sharkbotTotals[0]?.approved),
        sharkbotRevenueCents: number(sharkbotTotals[0]?.revenueCents),
      },
      users,
      ranking,
      sharkbot: {
        configured: Boolean(runtimeEnv().SHARKBOT_WEBHOOK_SECRET?.trim()),
        events: sharkbotRows,
        breakdown: sharkbotBreakdownRows.sort((left, right) => number(right.approved) - number(left.approved) || number(right.leads) - number(left.leads)),
      },
      period: { from: periodStart, to: periodEnd },
      health,
      audit,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar o painel administrativo." }, { status: 500 });
  }
}
