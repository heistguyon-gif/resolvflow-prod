import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accounts, campaigns, metaConnections, scheduledPosts } from "../../../../db/schema";
import { authErrorResponse, requireOwnerId } from "../../../../lib/auth";
import { connectionApiMode, getPublishedMedia } from "../../../../lib/meta-api";
import { decryptToken } from "../../../../lib/token-crypto";
import { NEXOFLOW_QUARANTINE, quarantineResponse } from "../../../../lib/quarantine";
import { recordAuditEvent } from "../../../../lib/audit";

const QUEUED = ["pending", "retry", "container_created", "paused"];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerUserId = await requireOwnerId(request); const { id } = await context.params;
    const payload = await request.json() as { action?: "reschedule" | "cancel" | "retry" | "resolve_publication"; scheduledFor?: string };
    if (NEXOFLOW_QUARANTINE && !["cancel", "resolve_publication"].includes(payload.action || "")) return quarantineResponse();
    const db = getDb(); const nowIso = new Date().toISOString();
    const [post] = await db.select().from(scheduledPosts).where(and(eq(scheduledPosts.id, id), eq(scheduledPosts.ownerUserId, ownerUserId))).limit(1);
    if (!post) return Response.json({ error: "Item da fila não encontrado." }, { status: 404 });
    const [campaign] = await db.select({ status: campaigns.status }).from(campaigns).where(and(eq(campaigns.id, post.campaignId), eq(campaigns.ownerUserId, ownerUserId))).limit(1);

    if (payload.action === "resolve_publication") {
      if (post.status !== "published" || !post.publishedMediaId) return Response.json({ error: "Esta publicação ainda não possui um post publicado para abrir." }, { status: 409 });
      if (post.publishedPermalink) return Response.json({ permalink: post.publishedPermalink, caption: post.captionOverride || "" });
      if (!post.connectionId) return Response.json({ error: "A conexão Meta usada nesta publicação não está mais disponível." }, { status: 409 });
      const [connection] = await db.select().from(metaConnections).where(and(eq(metaConnections.id, post.connectionId), eq(metaConnections.ownerUserId, ownerUserId))).limit(1);
      if (!connection) return Response.json({ error: "A conexão Meta usada nesta publicação não foi encontrada." }, { status: 404 });
      const accessToken = await decryptToken(connection.tokenCiphertext, connection.tokenIv);
      const media = await getPublishedMedia(post.publishedMediaId, accessToken, connectionApiMode(connection.scopes));
      const permalink = media.permalink || null;
      if (!permalink) return Response.json({ error: "A Meta não devolveu o link público deste post." }, { status: 502 });
      await db.update(scheduledPosts).set({ publishedPermalink: permalink, updatedAt: nowIso }).where(and(eq(scheduledPosts.id, id), eq(scheduledPosts.ownerUserId, ownerUserId)));
      return Response.json({ permalink, caption: post.captionOverride || "" });
    }

    if (payload.action === "reschedule") {
      if (![...QUEUED, "blocked", "failed"].includes(post.status)) return Response.json({ error: "Esta publicação não pode mais ser reagendada." }, { status: 409 });
      const scheduled = new Date(payload.scheduledFor || "");
      if (!Number.isFinite(scheduled.getTime()) || scheduled.getTime() < Date.now() + 60_000) return Response.json({ error: "Escolha um horário pelo menos um minuto à frente." }, { status: 400 });
      const wasQueued = QUEUED.includes(post.status); const nextStatus = campaign?.status === "paused" ? "paused" : "pending";
      await db.update(scheduledPosts).set({ status: nextStatus, scheduledFor: scheduled.toISOString(), nextAttemptAt: scheduled.toISOString(), attemptCount: 0, containerId: null, containerCaptionHash: null, lastError: null, lockedAt: null, lockToken: null, updatedAt: nowIso }).where(and(eq(scheduledPosts.id, id), eq(scheduledPosts.ownerUserId, ownerUserId)));
      if (!wasQueued) await db.update(accounts).set({ queueCount: sql`${accounts.queueCount} + 1`, updatedAt: nowIso }).where(and(eq(accounts.id, post.accountId), eq(accounts.ownerUserId, ownerUserId)));
      await recordAuditEvent(request, { ownerUserId, action: "queue.reschedule", entityType: "scheduled_post", entityId: id, summary: "Item da fila reagendado.", metadata: { status: nextStatus, scheduledFor: scheduled.toISOString() } });
      return Response.json({ rescheduled: true });
    }

    if (payload.action === "cancel") {
      if (![...QUEUED, "blocked", "failed"].includes(post.status)) return Response.json({ error: "Esta publicação não pode mais ser cancelada." }, { status: 409 });
      await db.update(scheduledPosts).set({ status: "cancelled", containerId: null, containerCaptionHash: null, lockedAt: null, lockToken: null, updatedAt: nowIso }).where(and(eq(scheduledPosts.id, id), eq(scheduledPosts.ownerUserId, ownerUserId)));
      if (QUEUED.includes(post.status)) await db.update(accounts).set({ queueCount: sql`max(${accounts.queueCount} - 1, 0)`, updatedAt: nowIso }).where(and(eq(accounts.id, post.accountId), eq(accounts.ownerUserId, ownerUserId)));
      await recordAuditEvent(request, { ownerUserId, action: "queue.cancel", entityType: "scheduled_post", entityId: id, summary: "Item da fila cancelado.", metadata: { previousStatus: post.status } });
      return Response.json({ cancelled: true });
    }

    if (payload.action === "retry") {
      if (!["blocked", "failed"].includes(post.status)) return Response.json({ error: "Somente itens bloqueados ou com falha podem ser reenviados." }, { status: 409 });
      const nextAttemptAt = new Date(Date.now() + 60_000).toISOString();
      await db.update(scheduledPosts).set({ status: campaign?.status === "paused" ? "paused" : "pending", scheduledFor: nextAttemptAt, nextAttemptAt, attemptCount: 0, containerId: null, containerCaptionHash: null, lastError: null, lockedAt: null, lockToken: null, updatedAt: nowIso }).where(and(eq(scheduledPosts.id, id), eq(scheduledPosts.ownerUserId, ownerUserId)));
      await db.update(accounts).set({ queueCount: sql`${accounts.queueCount} + 1`, updatedAt: nowIso }).where(and(eq(accounts.id, post.accountId), eq(accounts.ownerUserId, ownerUserId)));
      await recordAuditEvent(request, { ownerUserId, action: "queue.retry", entityType: "scheduled_post", entityId: id, summary: "Item da fila reenviado para nova tentativa.", metadata: { previousStatus: post.status } });
      return Response.json({ retried: true });
    }

    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível alterar a publicação." }, { status: 500 });
  }
}
