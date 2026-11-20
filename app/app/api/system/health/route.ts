import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { campaignMedia, metaConnections, scheduledPosts, systemHealth } from "../../../../db/schema";
import { authErrorResponse, requirePlatformAdmin } from "../../../../lib/auth";
import { getMediaBucket } from "../../../../lib/media-storage";
import { NEXOFLOW_QUARANTINE } from "../../../../lib/quarantine";

const ACTIVE_QUEUE_STATUSES = ["pending", "retry", "container_created", "processing"];

export async function GET(request: Request) {
  try {
    const ownerUserId = (await requirePlatformAdmin(request)).workspaceOwnerUserId;
    const db = getDb();
    const [[scheduler], [queue], [storage], [connections]] = await Promise.all([
      db.select().from(systemHealth).where(eq(systemHealth.key, "scheduler")).limit(1),
      db.select({
        pending: sql<number>`coalesce(sum(case when ${scheduledPosts.status} in ('pending','retry','container_created','processing') then 1 else 0 end), 0)`,
        failures: sql<number>`coalesce(sum(case when ${scheduledPosts.status} in ('failed','blocked') then 1 else 0 end), 0)`,
      }).from(scheduledPosts).where(eq(scheduledPosts.ownerUserId, ownerUserId)),
      db.select({ objects: sql<number>`count(*)`, bytes: sql<number>`coalesce(sum(${campaignMedia.sizeBytes}), 0)` }).from(campaignMedia).where(eq(campaignMedia.ownerUserId, ownerUserId)),
      db.select({ connected: sql<number>`count(*)` }).from(metaConnections).where(and(eq(metaConnections.ownerUserId, ownerUserId), eq(metaConnections.status, "connected"))),
    ]);

    let storageAvailable = true;
    let storageError: string | null = null;
    try { await getMediaBucket().list({ limit: 1 }); }
    catch (error) { storageAvailable = false; storageError = error instanceof Error ? error.message : "R2 indisponível"; }

    const lastCompletedTime = scheduler?.lastCompletedAt ? Date.parse(scheduler.lastCompletedAt) : Number.NaN;
    const stale = !NEXOFLOW_QUARANTINE && (!Number.isFinite(lastCompletedTime) || Date.now() - lastCompletedTime > 15 * 60_000);
    const schedulerStatus = NEXOFLOW_QUARANTINE ? "paused" : stale ? "stale" : scheduler?.status || "unknown";
    return Response.json({
      checkedAt: new Date().toISOString(),
      database: { available: true },
      scheduler: {
        status: schedulerStatus,
        stale,
        lastStartedAt: scheduler?.lastStartedAt ?? null,
        lastCompletedAt: scheduler?.lastCompletedAt ?? null,
        lastError: scheduler?.lastError ?? null,
      },
      storage: { available: storageAvailable, objects: Number(storage?.objects || 0), bytes: Number(storage?.bytes || 0), error: storageError },
      queue: { pending: Number(queue?.pending || 0), failures: Number(queue?.failures || 0), activeStatuses: ACTIVE_QUEUE_STATUSES },
      connections: { connected: Number(connections?.connected || 0) },
    });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível concluir o diagnóstico da infraestrutura." }, { status: 500 });
  }
}
