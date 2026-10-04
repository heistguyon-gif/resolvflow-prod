import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accounts, campaignMedia, campaigns, scheduledPosts } from "../../../../db/schema";
import { authErrorResponse, requireOwnerId } from "../../../../lib/auth";
import { composeCampaignCaption } from "../../../../lib/captions";
import { parseCaptionVariations } from "../../../../lib/caption-variations";
import { NEXOFLOW_QUARANTINE, quarantineResponse } from "../../../../lib/quarantine";
import { recordAuditEvent } from "../../../../lib/audit";

const EDITABLE_POST_STATUSES = ["pending", "retry", "paused", "blocked", "container_created"];
const PAUSABLE_POST_STATUSES = ["pending", "retry", "container_created"];
const CANCELLABLE_POST_STATUSES = [...EDITABLE_POST_STATUSES];

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerUserId = await requireOwnerId(request, "viewer"); const { id } = await context.params; const db = getDb();
    const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.ownerUserId, ownerUserId))).limit(1);
    if (!campaign) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
    const media = await db.select({ id: campaignMedia.id, fileName: campaignMedia.fileName, contentType: campaignMedia.contentType, sizeBytes: campaignMedia.sizeBytes, publicUrl: campaignMedia.publicUrl, purpose: campaignMedia.purpose, caption: campaignMedia.caption, sortOrder: campaignMedia.sortOrder }).from(campaignMedia).where(and(eq(campaignMedia.ownerUserId, ownerUserId), eq(campaignMedia.campaignId, id))).orderBy(asc(campaignMedia.sortOrder));
    const accountsOnCampaign = await db.select({
      id: accounts.id,
      username: accounts.username,
      pending: sql<number>`coalesce(sum(case when ${scheduledPosts.status} in ('pending','retry','container_created','processing','paused') then 1 else 0 end), 0)`,
      published: sql<number>`coalesce(sum(case when ${scheduledPosts.status} = 'published' then 1 else 0 end), 0)`,
      failed: sql<number>`coalesce(sum(case when ${scheduledPosts.status} in ('failed','blocked') then 1 else 0 end), 0)`,
      total: sql<number>`count(*)`,
    }).from(scheduledPosts).innerJoin(accounts, and(eq(accounts.id, scheduledPosts.accountId), eq(accounts.ownerUserId, ownerUserId))).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), eq(scheduledPosts.campaignId, id))).groupBy(accounts.id, accounts.username).orderBy(asc(accounts.username));
    return Response.json({
      campaign,
      media,
      accounts: accountsOnCampaign.map((account) => ({ ...account, pending: Number(account.pending || 0), published: Number(account.published || 0), failed: Number(account.failed || 0), total: Number(account.total || 0) })),
    });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível abrir a campanha." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerUserId = await requireOwnerId(request); const { id } = await context.params;
    const payload = await request.json() as { action?: string; name?: string; caption?: string; captionVariations?: unknown; hashtags?: string; shareToFeed?: boolean };
    if (NEXOFLOW_QUARANTINE && payload.action === "resume") return quarantineResponse();
    const db = getDb();
    const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.ownerUserId, ownerUserId))).limit(1);
    if (!campaign) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
    const now = new Date(); const nowIso = now.toISOString();

    if (payload.action === "update") {
      const name = payload.name?.trim() ?? campaign.name;
      const caption = typeof payload.caption === "string" ? payload.caption.slice(0, 10_000) : campaign.caption;
      const captionVariations = payload.captionVariations !== undefined ? JSON.stringify(parseCaptionVariations(payload.captionVariations)) : campaign.captionVariations;
      const variations = parseCaptionVariations(captionVariations);
      const hashtags = typeof payload.hashtags === "string" ? payload.hashtags.trim().slice(0, 1_000) : campaign.hashtags;
      const shareToFeed = typeof payload.shareToFeed === "boolean" ? payload.shareToFeed : campaign.shareToFeed;
      if (!name || name.length > 120) return Response.json({ error: "Informe um nome de campanha com até 120 caracteres." }, { status: 400 });
      const futurePosts = await db.select().from(scheduledPosts).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), eq(scheduledPosts.campaignId, id), inArray(scheduledPosts.status, EDITABLE_POST_STATUSES))).orderBy(asc(scheduledPosts.scheduledFor));
      const futureAccountIds = [...new Set(futurePosts.map((post) => post.accountId))];
      const futureAccounts = futureAccountIds.length ? await db.select({ id: accounts.id, username: accounts.username }).from(accounts).where(and(eq(accounts.ownerUserId, ownerUserId), inArray(accounts.id, futureAccountIds))) : [];
      const usernameByAccount = new Map(futureAccounts.map((account) => [account.id, account.username]));
      const mediaRows = await db.select({ id: campaignMedia.id, caption: campaignMedia.caption }).from(campaignMedia).where(and(eq(campaignMedia.ownerUserId, ownerUserId), eq(campaignMedia.campaignId, id)));
      const mediaCaptionById = new Map(mediaRows.map((item) => [item.id, item.caption]));
      await db.update(campaigns).set({ name, caption, captionVariations, hashtags, shareToFeed, updatedAt: nowIso }).where(and(eq(campaigns.id, id), eq(campaigns.ownerUserId, ownerUserId)));
      for (let index = 0; index < futurePosts.length; index += 1) {
        const post = futurePosts[index]; const resetContainer = post.status === "container_created";
        await db.update(scheduledPosts).set({
          captionOverride: composeCampaignCaption(caption, hashtags, index, { username: usernameByAccount.get(post.accountId), variations, mediaCaption: post.mediaItemId ? mediaCaptionById.get(post.mediaItemId) : "" }),
          ...(resetContainer ? { status: campaign.status === "paused" ? "paused" : "pending", containerId: null, containerCaptionHash: null, nextAttemptAt: post.scheduledFor, lockedAt: null, lockToken: null } : {}),
          updatedAt: nowIso,
        }).where(and(eq(scheduledPosts.id, post.id), eq(scheduledPosts.ownerUserId, ownerUserId)));
      }
      await recordAuditEvent(request, { ownerUserId, action: "campaign.update", entityType: "campaign", entityId: id, summary: `Campanha ${name} atualizada.`, metadata: { futurePosts: futurePosts.length, shareToFeed } });
      return Response.json({ updated: true, futurePosts: futurePosts.length });
    }

    if (payload.action === "pause") {
      if (campaign.status !== "scheduled") return Response.json({ error: "Somente campanhas agendadas podem ser pausadas." }, { status: 409 });
      const paused = await db.update(scheduledPosts).set({ status: "paused", containerId: null, containerCaptionHash: null, lockedAt: null, lockToken: null, updatedAt: nowIso }).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), eq(scheduledPosts.campaignId, id), inArray(scheduledPosts.status, PAUSABLE_POST_STATUSES))).returning({ id: scheduledPosts.id });
      await db.update(campaigns).set({ status: "paused", updatedAt: nowIso }).where(and(eq(campaigns.id, id), eq(campaigns.ownerUserId, ownerUserId)));
      await recordAuditEvent(request, { ownerUserId, action: "campaign.pause", entityType: "campaign", entityId: id, summary: `Campanha ${campaign.name} pausada.`, metadata: { posts: paused.length } });
      return Response.json({ paused: paused.length });
    }

    if (payload.action === "resume") {
      if (campaign.status !== "paused") return Response.json({ error: "Esta campanha não está pausada." }, { status: 409 });
      const pausedPosts = await db.select().from(scheduledPosts).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), eq(scheduledPosts.campaignId, id), eq(scheduledPosts.status, "paused"))).orderBy(asc(scheduledPosts.scheduledFor));
      const earliest = pausedPosts[0] ? new Date(pausedPosts[0].scheduledFor).getTime() : now.getTime();
      const shiftMs = Math.max(0, now.getTime() + 60_000 - earliest);
      for (const post of pausedPosts) {
        const scheduledFor = new Date(new Date(post.scheduledFor).getTime() + shiftMs).toISOString();
        await db.update(scheduledPosts).set({ status: "pending", scheduledFor, nextAttemptAt: scheduledFor, containerId: null, containerCaptionHash: null, lastError: null, lockedAt: null, lockToken: null, updatedAt: nowIso }).where(and(eq(scheduledPosts.id, post.id), eq(scheduledPosts.ownerUserId, ownerUserId)));
      }
      await db.update(campaigns).set({ status: "scheduled", ...(pausedPosts[0] ? { startAt: new Date(earliest + shiftMs).toISOString() } : {}), updatedAt: nowIso }).where(and(eq(campaigns.id, id), eq(campaigns.ownerUserId, ownerUserId)));
      await recordAuditEvent(request, { ownerUserId, action: "campaign.resume", entityType: "campaign", entityId: id, summary: `Campanha ${campaign.name} retomada.`, metadata: { posts: pausedPosts.length, shifted: shiftMs > 0 } });
      return Response.json({ resumed: pausedPosts.length, shifted: shiftMs > 0 });
    }

    if (payload.action === "cancel") {
      const futurePosts = await db.select().from(scheduledPosts).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), eq(scheduledPosts.campaignId, id), inArray(scheduledPosts.status, CANCELLABLE_POST_STATUSES)));
      const queuedByAccount = new Map<string, number>();
      for (const post of futurePosts) if (post.status !== "blocked") queuedByAccount.set(post.accountId, (queuedByAccount.get(post.accountId) ?? 0) + 1);
      await db.update(scheduledPosts).set({ status: "cancelled", containerId: null, containerCaptionHash: null, lockedAt: null, lockToken: null, updatedAt: nowIso }).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), eq(scheduledPosts.campaignId, id), inArray(scheduledPosts.status, CANCELLABLE_POST_STATUSES)));
      for (const [accountId, amount] of queuedByAccount) await db.update(accounts).set({ queueCount: sql`max(${accounts.queueCount} - ${amount}, 0)`, updatedAt: nowIso }).where(and(eq(accounts.id, accountId), eq(accounts.ownerUserId, ownerUserId)));
      await db.update(campaigns).set({ status: "cancelled", updatedAt: nowIso }).where(and(eq(campaigns.id, id), eq(campaigns.ownerUserId, ownerUserId)));
      await recordAuditEvent(request, { ownerUserId, action: "campaign.cancel", entityType: "campaign", entityId: id, summary: `Campanha ${campaign.name} encerrada.`, metadata: { posts: futurePosts.length } });
      return Response.json({ cancelled: futurePosts.length });
    }

    if (payload.action === "create_template") {
      const sourceEligible = campaign.status === "completed" || campaign.status === "scheduled" && ((campaign.publishedCount || 0) > 0 || Boolean(campaign.startAt && new Date(campaign.startAt).getTime() <= now.getTime()));
      if (!sourceEligible) return Response.json({ error: "Somente campanhas em andamento ou concluídas podem virar template." }, { status: 409 });
      const sourceMedia = await db.select().from(campaignMedia).where(and(eq(campaignMedia.ownerUserId, ownerUserId), eq(campaignMedia.campaignId, id))).orderBy(asc(campaignMedia.sortOrder));
      if (!sourceMedia.length) return Response.json({ error: "A campanha não possui arquivos para criar o template." }, { status: 409 });
      const templateId = crypto.randomUUID();
      const idMap = new Map(sourceMedia.map((item) => [item.id, crypto.randomUUID()]));
      const [template] = await db.insert(campaigns).values({
        id: templateId, ownerUserId, name: `${campaign.name} · template`.slice(0, 120), mediaType: campaign.mediaType, metaApiVersion: campaign.metaApiVersion,
        mediaUrl: campaign.mediaUrl, mediaCount: campaign.mediaCount, coverMediaId: campaign.coverMediaId ? idMap.get(campaign.coverMediaId) ?? null : null,
        caption: campaign.caption, captionVariations: campaign.captionVariations, hashtags: campaign.hashtags, shareToFeed: campaign.shareToFeed,
        distributionMode: campaign.distributionMode, mediaOrder: campaign.mediaOrder, repeatCount: campaign.repeatCount, respectDailyLimit: campaign.respectDailyLimit,
        status: "template", timezone: campaign.timezone, startAt: null, stopAt: null, intervalMinutes: campaign.intervalMinutes,
        totalAccounts: 0, publishedCount: 0, failedCount: 0,
      }).returning();
      const templateMedia = sourceMedia.map((item) => ({
        id: idMap.get(item.id)!, ownerUserId, campaignId: templateId, objectKey: item.objectKey, fileName: item.fileName, contentType: item.contentType,
        sizeBytes: item.sizeBytes, publicUrl: item.publicUrl, purpose: item.purpose, caption: item.caption, sortOrder: item.sortOrder,
      }));
      try {
        for (let index = 0; index < templateMedia.length; index += 8) await db.insert(campaignMedia).values(templateMedia.slice(index, index + 8));
      } catch (error) {
        try { await db.delete(campaigns).where(and(eq(campaigns.id, templateId), eq(campaigns.ownerUserId, ownerUserId))); } catch { /* preserva a falha original */ }
        throw error;
      }
      await recordAuditEvent(request, { ownerUserId, action: "campaign.create_template", entityType: "campaign", entityId: templateId, summary: `Template criado a partir de ${campaign.name}.`, metadata: { sourceCampaignId: id, media: templateMedia.length } });
      return Response.json({ template }, { status: 201 });
    }

    if (payload.action === "duplicate") {
      const sourceMedia = await db.select().from(campaignMedia).where(and(eq(campaignMedia.ownerUserId, ownerUserId), eq(campaignMedia.campaignId, id))).orderBy(asc(campaignMedia.sortOrder));
      if (!sourceMedia.length) return Response.json({ error: "A campanha não possui arquivos para duplicar." }, { status: 409 });
      const duplicateId = crypto.randomUUID();
      const idMap = new Map(sourceMedia.map((item) => [item.id, crypto.randomUUID()]));
      const [duplicate] = await db.insert(campaigns).values({
        id: duplicateId, ownerUserId, name: `${campaign.name} · cópia`.slice(0, 120), mediaType: campaign.mediaType, mediaUrl: campaign.mediaUrl, mediaCount: campaign.mediaCount,
        coverMediaId: campaign.coverMediaId ? idMap.get(campaign.coverMediaId) ?? null : null, caption: campaign.caption, captionVariations: campaign.captionVariations, hashtags: campaign.hashtags, shareToFeed: campaign.shareToFeed,
        distributionMode: campaign.distributionMode, repeatCount: campaign.repeatCount, respectDailyLimit: campaign.respectDailyLimit, status: "draft", timezone: campaign.timezone,
        startAt: null, stopAt: null, intervalMinutes: campaign.intervalMinutes, totalAccounts: 0, publishedCount: 0, failedCount: 0,
      }).returning();
      const duplicatedMedia = sourceMedia.map((item) => ({
        id: idMap.get(item.id)!, ownerUserId, campaignId: duplicateId, objectKey: item.objectKey, fileName: item.fileName, contentType: item.contentType,
        sizeBytes: item.sizeBytes, publicUrl: item.publicUrl, purpose: item.purpose, caption: item.caption, sortOrder: item.sortOrder,
      }));
      for (let index = 0; index < duplicatedMedia.length; index += 8) await db.insert(campaignMedia).values(duplicatedMedia.slice(index, index + 8));
      await recordAuditEvent(request, { ownerUserId, action: "campaign.duplicate", entityType: "campaign", entityId: duplicateId, summary: `Campanha ${campaign.name} duplicada como rascunho.`, metadata: { sourceCampaignId: id, media: duplicatedMedia.length } });
      return Response.json({ duplicate }, { status: 201 });
    }

    return Response.json({ error: "Ação de campanha inválida." }, { status: 400 });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar a campanha." }, { status: 500 });
  }
}
