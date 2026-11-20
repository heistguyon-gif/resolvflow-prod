import { operationalPostAccount } from "../../../../lib/account-archive";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accounts, campaignMedia, campaigns, scheduledPosts } from "../../../../db/schema";
import { authErrorResponse, requireOwnerId } from "../../../../lib/auth";
import { composeCampaignCaption } from "../../../../lib/captions";
import { parseCaptionVariations } from "../../../../lib/caption-variations";
import { NEXOFLOW_QUARANTINE, quarantineResponse } from "../../../../lib/quarantine";
import { recordAuditEvent } from "../../../../lib/audit";
import { PUBLISHED_CONTAINER_MESSAGE, requiresPublicationReconciliation } from "../../../../lib/publication-recovery";
import { archiveCampaign, CAMPAIGN_READ_HEADERS, campaignManagementErrorResponse, duplicateCampaign, renameCampaign } from "../../../../lib/campaign-management";
import { CampaignConfigurationError, parseCampaignConfiguration } from "../../../../lib/campaign-configuration";
import { protectedCampaignPostEvidence, safelyCancellableCampaignPost } from "../../../../lib/campaign-publication-protection";
import { getMediaBucket } from "../../../../lib/media-storage";
import { readProfileBinding, assertProfileDistribution, ProfileBindingError } from "../../../../lib/profile-video-binding";
import { requireReadyProfileAccount } from "../../../../lib/profile-video-binding-runtime";
import { profileReleasePreview, releaseProfileDraft } from "../../../../lib/profile-draft-release";

const EDITABLE_POST_STATUSES = ["pending", "retry", "paused", "blocked", "container_created"];
const PAUSABLE_POST_STATUSES = ["pending", "retry", "container_created"];

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerUserId = await requireOwnerId(request, "viewer"); const { id } = await context.params; const db = getDb();
    const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.ownerUserId, ownerUserId))).limit(1);
    if (!campaign) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
    const media = await db.select({ id: campaignMedia.id, fileName: campaignMedia.fileName, contentType: campaignMedia.contentType, sizeBytes: campaignMedia.sizeBytes, publicUrl: campaignMedia.publicUrl, purpose: campaignMedia.purpose, caption: campaignMedia.caption, sortOrder: campaignMedia.sortOrder }).from(campaignMedia).where(and(eq(campaignMedia.ownerUserId, ownerUserId), eq(campaignMedia.campaignId, id))).orderBy(asc(campaignMedia.sortOrder));
    const bindingMedia = await db.select({ objectKey: campaignMedia.objectKey, purpose: campaignMedia.purpose }).from(campaignMedia).where(and(eq(campaignMedia.ownerUserId, ownerUserId), eq(campaignMedia.campaignId, id)));
    const profileAccountId = await readProfileBinding(bindingMedia, ownerUserId, key => getMediaBucket().head(key));
    const accountsOnCampaign = await db.select({
      id: accounts.id,
      username: accounts.username,
      pending: sql<number>`coalesce(sum(case when ${scheduledPosts.status} in ('pending','retry','container_created','processing','paused') then 1 else 0 end), 0)`,
      published: sql<number>`coalesce(sum(case when ${scheduledPosts.status} = 'published' then 1 else 0 end), 0)`,
      failed: sql<number>`coalesce(sum(case when ${scheduledPosts.status} in ('failed','blocked') then 1 else 0 end), 0)`,
      total: sql<number>`count(*)`,
    }).from(scheduledPosts).innerJoin(accounts, and(eq(accounts.id, scheduledPosts.accountId), eq(accounts.ownerUserId, ownerUserId))).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), eq(scheduledPosts.campaignId, id))).groupBy(accounts.id, accounts.username).orderBy(asc(accounts.username));
    return Response.json({
      campaign: { ...campaign, profileAccountId },
      profileRelease: await profileReleasePreview(request, campaign, profileAccountId),
      media,
      accounts: accountsOnCampaign.map((account) => ({ ...account, pending: Number(account.pending || 0), published: Number(account.published || 0), failed: Number(account.failed || 0), total: Number(account.total || 0) })),
    });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    if (error instanceof ProfileBindingError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível abrir a campanha." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerUserId = await requireOwnerId(request, "editor"); const { id } = await context.params;
    let payload: { action?: string; name?: string; caption?: string; captionVariations?: unknown; hashtags?: string; shareToFeed?: boolean } & Record<string, unknown>;
    try { payload = await request.json(); } catch { return Response.json({ error: "JSON inválido." }, { status: 400 }); }
    if (!payload || typeof payload !== "object" || typeof payload.action !== "string") return Response.json({ error: "Informe uma ação de campanha válida." }, { status: 400 });
    if (payload.action === "release_profile_binding") return Response.json(await releaseProfileDraft(request, id, payload), { headers: CAMPAIGN_READ_HEADERS });
    if (payload.action === "rename") return Response.json(await renameCampaign(request, ownerUserId, id, payload.name), { headers: CAMPAIGN_READ_HEADERS });
    if (payload.action === "duplicate") {
      const result = await duplicateCampaign(request, ownerUserId, id);
      return Response.json(result, { status: 201, headers: CAMPAIGN_READ_HEADERS });
    }
    if (NEXOFLOW_QUARANTINE && payload.action === "resume") return quarantineResponse();
    const db = getDb();
    const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.ownerUserId, ownerUserId))).limit(1);
    if (!campaign) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
    if (campaign.status === "archived") return Response.json({ error: "Esta campanha foi excluída. Seu histórico permanece disponível." }, { status: 409 });
    if (["update", "resume", "create_template"].includes(payload.action)) {
      const bindingMedia = await db.select({ objectKey: campaignMedia.objectKey, purpose: campaignMedia.purpose }).from(campaignMedia).where(and(eq(campaignMedia.ownerUserId, ownerUserId), eq(campaignMedia.campaignId, id)));
      const profileAccountId = await readProfileBinding(bindingMedia, ownerUserId, key => getMediaBucket().head(key));
      assertProfileDistribution(profileAccountId, payload.distributionMode ?? campaign.distributionMode, payload.intervalMode);
      if (profileAccountId && payload.action === "resume") {
        await requireReadyProfileAccount(ownerUserId, profileAccountId);
        const queued = await db.select({ accountId: scheduledPosts.accountId }).from(scheduledPosts).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), eq(scheduledPosts.campaignId, id)));
        if (queued.some(row => row.accountId !== profileAccountId)) throw new ProfileBindingError("Fila incompatível com o perfil dos vídeos. Retomada bloqueada.");
      }
    }
    const now = new Date(); const nowIso = now.toISOString();
    const campaignNotArchived = sql`exists (select 1 from campaigns c where c.id=${id} and c.owner_user_id=${ownerUserId} and c.status!='archived')`;

    if (payload.action === "update") {
      const configuration = parseCampaignConfiguration(payload);
      const configUpdate = Object.keys(configuration).length > 0;
      if (configUpdate && campaign.status !== "draft") return Response.json({ error: "A preparação só pode ser alterada em rascunho; os posts existentes não serão reprogramados." }, { status: 409 });
      const name = payload.name?.trim() ?? campaign.name;
      const caption = typeof payload.caption === "string" ? payload.caption.slice(0, 10_000) : campaign.caption;
      const captionVariations = payload.captionVariations !== undefined ? JSON.stringify(parseCaptionVariations(payload.captionVariations)) : campaign.captionVariations;
      const variations = parseCaptionVariations(captionVariations);
      const hashtags = typeof payload.hashtags === "string" ? payload.hashtags.trim().slice(0, 1_000) : campaign.hashtags;
      const shareToFeed = typeof payload.shareToFeed === "boolean" ? payload.shareToFeed : campaign.shareToFeed;
      if (!name || name.length > 120) return Response.json({ error: "Informe um nome de campanha com até 120 caracteres." }, { status: 400 });
      const contentUpdate = payload.caption !== undefined || payload.captionVariations !== undefined || payload.hashtags !== undefined || payload.shareToFeed !== undefined;
      const futurePosts = contentUpdate ? (await db.select().from(scheduledPosts).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), eq(scheduledPosts.campaignId, id), inArray(scheduledPosts.status, EDITABLE_POST_STATUSES))).orderBy(asc(scheduledPosts.scheduledFor))).filter((post) => !requiresPublicationReconciliation(post)) : [];
      const futureAccountIds = [...new Set(futurePosts.map((post) => post.accountId))];
      const futureAccounts = futureAccountIds.length ? await db.select({ id: accounts.id, username: accounts.username }).from(accounts).where(and(eq(accounts.ownerUserId, ownerUserId), inArray(accounts.id, futureAccountIds))) : [];
      const usernameByAccount = new Map(futureAccounts.map((account) => [account.id, account.username]));
      const mediaRows = futurePosts.length ? await db.select({ id: campaignMedia.id, caption: campaignMedia.caption }).from(campaignMedia).where(and(eq(campaignMedia.ownerUserId, ownerUserId), eq(campaignMedia.campaignId, id))) : [];
      const mediaCaptionById = new Map(mediaRows.map((item) => [item.id, item.caption]));
      const [updated] = await db.update(campaigns).set({ name, caption, captionVariations, hashtags, shareToFeed, ...configuration, updatedAt: nowIso }).where(and(eq(campaigns.id, id), eq(campaigns.ownerUserId, ownerUserId), sql`${campaigns.status} != 'archived'`, ...(configUpdate ? [eq(campaigns.status, "draft")] : []))).returning();
      if (!updated) return Response.json({ error: "A campanha mudou ou foi excluída. Atualize a lista." }, { status: 409 });
      for (let index = 0; index < futurePosts.length; index += 1) {
        const post = futurePosts[index];
        await db.update(scheduledPosts).set({
          captionOverride: composeCampaignCaption(caption, hashtags, index, { username: usernameByAccount.get(post.accountId), variations, mediaCaption: post.mediaItemId ? mediaCaptionById.get(post.mediaItemId) : "" }),
          updatedAt: nowIso,
        }).where(and(eq(scheduledPosts.id, post.id), eq(scheduledPosts.ownerUserId, ownerUserId), eq(scheduledPosts.status, post.status), sql`${scheduledPosts.lastError} is ${post.lastError}`, campaignNotArchived));
      }
      const warnings: string[] = [];
      try { await recordAuditEvent(request, { ownerUserId, action: "campaign.update", entityType: "campaign", entityId: id, summary: `Campanha ${name} atualizada.`, metadata: { futurePosts: futurePosts.length, shareToFeed, configuration: Object.keys(configuration).join(",") } }); }
      catch { warnings.push("A alteração foi salva, mas não foi possível registrar a auditoria."); }
      return Response.json({ updated: true, futurePosts: futurePosts.length, campaign: updated, warnings });
    }

    if (payload.action === "pause") {
      if (campaign.status !== "scheduled") return Response.json({ error: "Somente campanhas agendadas podem ser pausadas." }, { status: 409 });
      const paused = await db.update(scheduledPosts).set({ status: "paused", lockedAt: null, lockToken: null, updatedAt: nowIso }).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), eq(scheduledPosts.campaignId, id), inArray(scheduledPosts.status, PAUSABLE_POST_STATUSES), campaignNotArchived)).returning({ id: scheduledPosts.id });
      const [changed] = await db.update(campaigns).set({ status: "paused", updatedAt: nowIso }).where(and(eq(campaigns.id, id), eq(campaigns.ownerUserId, ownerUserId), eq(campaigns.status, "scheduled"))).returning({ id: campaigns.id });
      if (!changed) return Response.json({ error: "A campanha mudou. Atualize a lista." }, { status: 409 });
      await recordAuditEvent(request, { ownerUserId, action: "campaign.pause", entityType: "campaign", entityId: id, summary: `Campanha ${campaign.name} pausada.`, metadata: { posts: paused.length } });
      return Response.json({ paused: paused.length });
    }

    if (payload.action === "resume") {
      if (campaign.status !== "paused") return Response.json({ error: "Esta campanha não está pausada." }, { status: 409 });
      const allPausedPosts = await db.select().from(scheduledPosts).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), eq(scheduledPosts.campaignId, id), eq(scheduledPosts.status, "paused"))).orderBy(asc(scheduledPosts.scheduledFor));
      const pausedPosts = allPausedPosts.filter((post) => !requiresPublicationReconciliation(post));
      if (allPausedPosts.length && !pausedPosts.length) return Response.json({ error: PUBLISHED_CONTAINER_MESSAGE }, { status: 409 });
      const earliest = pausedPosts[0] ? new Date(pausedPosts[0].scheduledFor).getTime() : now.getTime();
      const shiftMs = Math.max(0, now.getTime() + 60_000 - earliest);
      let resumed = 0;
      for (const post of pausedPosts) {
        const scheduledFor = new Date(new Date(post.scheduledFor).getTime() + shiftMs).toISOString();
        const [changed] = await db.update(scheduledPosts).set({ status: post.containerId ? "container_created" : "pending", scheduledFor, nextAttemptAt: scheduledFor, lastError: null, lockedAt: null, lockToken: null, updatedAt: nowIso }).where(and(eq(scheduledPosts.id, post.id), eq(scheduledPosts.ownerUserId, ownerUserId), eq(scheduledPosts.status, "paused"), sql`${scheduledPosts.lastError} is ${post.lastError}`, campaignNotArchived, operationalPostAccount(), safelyCancellableCampaignPost())).returning({ id: scheduledPosts.id });
        if (changed) resumed += 1;
      }
      if (pausedPosts.length && !resumed) return Response.json({ error: "Os itens mudaram. Atualize a campanha antes de tentar novamente." }, { status: 409 });
      const [changed] = await db.update(campaigns).set({ status: "scheduled", ...(pausedPosts[0] ? { startAt: new Date(earliest + shiftMs).toISOString() } : {}), updatedAt: nowIso }).where(and(eq(campaigns.id, id), eq(campaigns.ownerUserId, ownerUserId), eq(campaigns.status, "paused"))).returning({ id: campaigns.id });
      if (!changed) return Response.json({ error: "A campanha mudou. Atualize a lista." }, { status: 409 });
      await recordAuditEvent(request, { ownerUserId, action: "campaign.resume", entityType: "campaign", entityId: id, summary: `Campanha ${campaign.name} retomada.`, metadata: { posts: resumed, shifted: shiftMs > 0 } });
      return Response.json({ resumed, shifted: shiftMs > 0 });
    }

    if (payload.action === "cancel") {
      if (!["scheduled", "paused", "cancelled"].includes(campaign.status)) return Response.json({ error: "Somente campanhas agendadas, pausadas ou já encerradas podem ser encerradas." }, { status: 409 });
      const scope = and(eq(scheduledPosts.ownerUserId, ownerUserId), eq(scheduledPosts.campaignId, id));
      const stopped = sql`exists(select 1 from campaigns c where c.id=${id} and c.owner_user_id=${ownerUserId} and c.status='cancelled')`;
      // Atomic local change. A new processing reservation or receipt is checked in SQL,
      // never overwritten using an earlier snapshot. This does not cancel an external POST.
      const [changed, recovered, cancelled] = await db.batch([
        db.update(campaigns).set({ status: "cancelled", updatedAt: nowIso }).where(and(eq(campaigns.id, id), eq(campaigns.ownerUserId, ownerUserId), eq(campaigns.status, campaign.status))).returning({ id: campaigns.id }),
        // Rescue evidence left cancelled by the legacy path before the five-day purge.
        db.update(scheduledPosts).set({ status: sql`case when ${scheduledPosts.publishedAt} is not null or nullif(${scheduledPosts.publishedMediaId}, '') is not null or nullif(${scheduledPosts.publishedPermalink}, '') is not null then 'published' else 'paused' end`, updatedAt: nowIso })
          .where(and(scope, stopped, eq(scheduledPosts.status, "cancelled"), protectedCampaignPostEvidence())).returning({ id: scheduledPosts.id }),
        db.update(scheduledPosts).set({ status: "cancelled", updatedAt: nowIso }).where(and(scope, stopped, safelyCancellableCampaignPost())).returning({ id: scheduledPosts.id }),
        db.update(accounts).set({ queueCount: sql`(select count(*) from scheduled_posts p join campaigns c on c.id=p.campaign_id and c.owner_user_id=p.owner_user_id where p.owner_user_id=${ownerUserId} and p.account_id=${accounts.id} and c.status not in ('archived','cancelled') and p.status in ('pending','retry','container_created','processing','paused'))`, updatedAt: nowIso })
          .where(and(eq(accounts.ownerUserId, ownerUserId), stopped, sql`${accounts.id} in (select account_id from scheduled_posts where owner_user_id=${ownerUserId} and campaign_id=${id})`)),
        db.update(campaigns).set({ publishedCount: sql`(select count(*) from scheduled_posts p where p.campaign_id=${id} and p.owner_user_id=${ownerUserId} and p.status='published')` }).where(and(eq(campaigns.id, id), eq(campaigns.ownerUserId, ownerUserId), eq(campaigns.status, "cancelled"))),
      ]);
      if (!changed.length) return Response.json({ error: "A campanha mudou. Atualize a lista antes de encerrar." }, { status: 409 });
      const [counts] = await db.select({
        protectedPosts: sql<number>`coalesce(sum(case when ${protectedCampaignPostEvidence()} then 1 else 0 end),0)`,
        inFlightPosts: sql<number>`coalesce(sum(case when ${scheduledPosts.status}='processing' or ${scheduledPosts.lockedAt} is not null or nullif(${scheduledPosts.lockToken}, '') is not null then 1 else 0 end),0)`,
        unsettled: sql<number>`coalesce(sum(case when ${scheduledPosts.status} not in ('cancelled','published','processing') and ${scheduledPosts.lockedAt} is null and nullif(${scheduledPosts.lockToken}, '') is null and not ${protectedCampaignPostEvidence()} then 1 else 0 end),0)`,
      }).from(scheduledPosts).where(scope);
      if (Number(counts.unsettled)) return Response.json({ error: "A campanha foi encerrada, mas alguns estados exigem conferência. Nenhuma operação será repetida automaticamente." }, { status: 500 });
      const warnings: string[] = [];
      if (Number(counts.protectedPosts)) warnings.push("Publicações confirmadas ou indeterminadas foram preservadas para conferência.");
      if (Number(counts.inFlightPosts)) warnings.push("Há envios em processamento; uma requisição externa já iniciada pode finalizar. Seu recibo e reserva permanecem preservados.");
      if (recovered.length) warnings.push("Evidências de cancelamentos anteriores foram recuperadas para o histórico, sem novo envio.");
      try { await recordAuditEvent(request, { ownerUserId, action: "campaign.cancel", entityType: "campaign", entityId: id, summary: `Campanha ${campaign.name} encerrada.`, metadata: { posts: cancelled.length, recovered: recovered.length, protectedPosts: Number(counts.protectedPosts), inFlightPosts: Number(counts.inFlightPosts) } }); }
      catch { warnings.push("A campanha foi encerrada, mas não foi possível registrar a auditoria."); }
      const [current] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.ownerUserId, ownerUserId))).limit(1);
      return Response.json({ cancelled: cancelled.length, campaign: current, protectedPosts: Number(counts.protectedPosts), inFlightPosts: Number(counts.inFlightPosts), warnings });
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

    return Response.json({ error: "Ação de campanha inválida." }, { status: 400 });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    if (error instanceof ProfileBindingError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof CampaignConfigurationError) return Response.json({ error: error.message }, { status: 400 });
    const managementResponse = campaignManagementErrorResponse(error); if (managementResponse) return managementResponse;
    return Response.json({ error: "Não foi possível atualizar a campanha." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerUserId = await requireOwnerId(request, "editor");
    const { id } = await context.params;
    return Response.json(await archiveCampaign(request, ownerUserId, id), { headers: CAMPAIGN_READ_HEADERS });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    if (error instanceof ProfileBindingError) return Response.json({ error: error.message }, { status: error.status });
    const managementResponse = campaignManagementErrorResponse(error); if (managementResponse) return managementResponse;
    return Response.json({ error: "Não foi possível excluir a campanha." }, { status: 500, headers: CAMPAIGN_READ_HEADERS });
  }
}
