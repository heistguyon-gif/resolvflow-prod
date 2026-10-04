import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { metaConnections, scheduledPosts, systemHealth } from "../../../../db/schema";
import { authErrorResponse, requirePlatformAdmin } from "../../../../lib/auth";
import { normalizePace, PUBLISH_PACE_KEY } from "../../../../lib/publish-pace";

const LIVE = ["pending", "retry", "container_created", "processing"];

export async function GET(request: Request) {
  try {
    const ctx = await requirePlatformAdmin(request);
    const db = getDb();
    const now = new Date().toISOString();
    const [paceRow, scheduler, connections, dueByConnection, totals] = await Promise.all([
      db.select().from(systemHealth).where(eq(systemHealth.key, PUBLISH_PACE_KEY)).limit(1),
      db.select().from(systemHealth).where(eq(systemHealth.key, "scheduler")).limit(1),
      db.select({
        id: metaConnections.id,
        username: metaConnections.username,
        used: metaConnections.publishingLimitUsed,
        total: metaConnections.publishingLimitTotal,
      }).from(metaConnections).where(and(eq(metaConnections.ownerUserId, ctx.workspaceOwnerUserId), eq(metaConnections.status, "connected"))),
      db.select({
        connectionId: scheduledPosts.connectionId,
        due: sql<number>`coalesce(sum(case when ${scheduledPosts.nextAttemptAt} <= ${now} then 1 else 0 end), 0)`,
        pending: sql<number>`count(*)`,
      }).from(scheduledPosts).where(and(eq(scheduledPosts.ownerUserId, ctx.workspaceOwnerUserId), inArray(scheduledPosts.status, LIVE))).groupBy(scheduledPosts.connectionId),
      db.select({
        due: sql<number>`coalesce(sum(case when ${scheduledPosts.nextAttemptAt} <= ${now} then 1 else 0 end), 0)`,
        pending: sql<number>`count(*)`,
      }).from(scheduledPosts).where(and(eq(scheduledPosts.ownerUserId, ctx.workspaceOwnerUserId), inArray(scheduledPosts.status, LIVE))),
    ]);
    const pace = normalizePace(paceRow[0]?.status) ?? "fast";
    const load = new Map(dueByConnection.map((row) => [row.connectionId, { due: Number(row.due || 0), pending: Number(row.pending || 0) }]));
    const accounts = connections.map((connection) => {
      const queue = load.get(connection.id) ?? { due: 0, pending: 0 };
      const total = Number(connection.total || 0);
      const used = Number(connection.used || 0);
      return { username: connection.username || "sem usuário", used, total, remaining: Math.max(0, total - used), due: queue.due, pending: queue.pending };
    }).sort((a, b) => b.due - a.due || a.remaining - b.remaining);
    const quota = accounts.reduce((sum, account) => ({ used: sum.used + account.used, total: sum.total + account.total, remaining: sum.remaining + account.remaining }), { used: 0, total: 0, remaining: 0 });
    let lastRun: { published?: number; retried?: number; failed?: number; found?: number; timedOut?: boolean } | null = null;
    try {
      const details = JSON.parse(scheduler[0]?.detailsJson || "{}") as { result?: typeof lastRun; timedOut?: boolean };
      lastRun = details.result ? { ...details.result, timedOut: details.timedOut } : null;
    } catch { lastRun = null; }
    return Response.json({
      pace,
      dueNow: Number(totals[0]?.due || 0),
      pending: Number(totals[0]?.pending || 0),
      quota,
      accounts: accounts.slice(0, 24),
      scheduler: {
        status: scheduler[0]?.status ?? "unknown",
        lastError: scheduler[0]?.lastError ?? null,
        lastCompletedAt: scheduler[0]?.lastCompletedAt ?? null,
        lastRun,
      },
    });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível ler o ritmo da fila." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requirePlatformAdmin(request);
    const payload = await request.json() as { pace?: string };
    const pace = normalizePace(payload.pace);
    if (!pace) return Response.json({ error: "Escolha economia, normal ou rápido." }, { status: 400 });
    const now = new Date().toISOString();
    const db = getDb();
    const [existing] = await db.select({ key: systemHealth.key }).from(systemHealth).where(eq(systemHealth.key, PUBLISH_PACE_KEY)).limit(1);
    if (existing) {
      await db.update(systemHealth).set({ status: pace, detailsJson: JSON.stringify({ pace, by: ctx.email }), updatedAt: now }).where(eq(systemHealth.key, PUBLISH_PACE_KEY));
    } else {
      await db.insert(systemHealth).values({ key: PUBLISH_PACE_KEY, status: pace, detailsJson: JSON.stringify({ pace, by: ctx.email }), updatedAt: now });
    }
    return Response.json({ pace });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar o ritmo." }, { status: 500 });
  }
}
