import { and, asc, eq, ne, sql } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, campaignMedia, campaigns, scheduledPosts } from "../db/schema";
import { recordAuditEvent } from "./audit";
import { protectedCampaignPostEvidence as protectedEvidence, safelyCancellableCampaignPost } from "./campaign-publication-protection";
import type { CampaignArchiveResult } from "./campaign-management-types";
import { getMediaBucket } from "./media-storage";
import { readProfileBinding } from "./profile-video-binding";

export const ARCHIVED_CAMPAIGN_STATUS = "archived";
export const CAMPAIGN_READ_HEADERS = { "cache-control": "private, no-store" };
const LIVE = ["pending", "retry", "container_created", "processing", "paused"];

export class CampaignManagementError extends Error {
  constructor(message: string, public status: number, public archived = false) { super(message); }
}

export async function ownedCampaign(ownerUserId: string, id: string) {
  const [campaign] = await getDb().select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.ownerUserId, ownerUserId))).limit(1);
  if (!campaign) throw new CampaignManagementError("Campanha não encontrada.", 404);
  return campaign;
}

export function campaignManagementErrorResponse(error: unknown) {
  if (!(error instanceof CampaignManagementError)) return null;
  return Response.json({ error: error.message, ...(error.archived ? { archived: true } : {}) }, { status: error.status, headers: CAMPAIGN_READ_HEADERS });
}

export async function renameCampaign(request: Request, ownerUserId: string, id: string, value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 120) throw new CampaignManagementError("Informe um nome de campanha com até 120 caracteres.", 400);
  await ownedCampaign(ownerUserId, id);
  const [campaign] = await getDb().update(campaigns).set({ name, updatedAt: new Date().toISOString() })
    .where(and(eq(campaigns.id, id), eq(campaigns.ownerUserId, ownerUserId), ne(campaigns.status, ARCHIVED_CAMPAIGN_STATUS))).returning();
  if (!campaign) throw new CampaignManagementError("A campanha foi excluída. Atualize a lista.", 409);
  const warnings = await audit(request, { ownerUserId, action: "campaign.rename", entityType: "campaign", entityId: id, summary: `Campanha renomeada para ${name}.` });
  return { campaign, warnings };
}

async function audit(request: Request, event: Parameters<typeof recordAuditEvent>[1]) {
  try { await recordAuditEvent(request, event); return []; }
  catch { return ["A alteração foi salva, mas não foi possível registrar a auditoria."]; }
}

export async function duplicateCampaign(request: Request, ownerUserId: string, id: string) {
  const db = getDb();
  const source = await ownedCampaign(ownerUserId, id);
  if (source.status === ARCHIVED_CAMPAIGN_STATUS) throw new CampaignManagementError("Esta campanha foi excluída e não pode ser duplicada.", 409);
  const media = await db.select().from(campaignMedia).where(and(eq(campaignMedia.ownerUserId, ownerUserId), eq(campaignMedia.campaignId, id))).orderBy(asc(campaignMedia.sortOrder));
  if (!media.length) throw new CampaignManagementError("A campanha não possui arquivos para duplicar.", 409);
  const profileAccountId = await readProfileBinding(media, ownerUserId, key => getMediaBucket().head(key));
  const duplicateId = crypto.randomUUID();
  const idMap = new Map(media.map((item) => [item.id, crypto.randomUUID()]));
  const draft = {
    id: duplicateId, ownerUserId, name: `${source.name} · cópia`.slice(0, 120),
    mediaType: source.mediaType, metaApiVersion: source.metaApiVersion, mediaUrl: source.mediaUrl,
    mediaCount: media.filter((item) => item.purpose === "content").length,
    coverMediaId: source.coverMediaId ? idMap.get(source.coverMediaId) ?? null : null,
    caption: source.caption, captionVariations: source.captionVariations, hashtags: source.hashtags,
    shareToFeed: source.shareToFeed, distributionMode: source.distributionMode,
    mediaOrder: source.mediaOrder, repeatCount: source.repeatCount, respectDailyLimit: source.respectDailyLimit,
    status: "draft", timezone: source.timezone, startAt: null, stopAt: null,
    intervalMinutes: source.intervalMinutes, totalAccounts: 0, publishedCount: 0, failedCount: 0,
  };
  const copied = media.map((item) => ({
    id: idMap.get(item.id)!, ownerUserId, campaignId: duplicateId, objectKey: item.objectKey,
    fileName: item.fileName, contentType: item.contentType, sizeBytes: item.sizeBytes,
    publicUrl: item.publicUrl, purpose: item.purpose, caption: item.caption, sortOrder: item.sortOrder,
  }));
  // One D1 batch is atomic; do not split it into independently committed batches.
  // No cleanup DELETE: rollback covers the draft and all media rows together.
  const statements = [db.insert(campaigns).values(draft).returning()];
  const mediaStatements = [];
  for (let offset = 0; offset < copied.length; offset += 8) mediaStatements.push(db.insert(campaignMedia).values(copied.slice(offset, offset + 8)));
  let duplicate: typeof source;
  try {
    const result = await db.batch([statements[0], ...mediaStatements]);
    duplicate = result[0][0];
  } catch {
    throw new CampaignManagementError("Não foi possível confirmar a cópia da campanha. Não repita automaticamente; confira a lista de rascunhos.", 500);
  }
  const warnings = await audit(request, { ownerUserId, action: "campaign.duplicate", entityType: "campaign", entityId: duplicateId, summary: `Campanha ${source.name} duplicada como rascunho.`, metadata: { sourceCampaignId: id, media: copied.length } });
  return { duplicate: { ...duplicate, profileAccountId }, warnings };
}

export async function archiveCampaign(request: Request, ownerUserId: string, id: string): Promise<CampaignArchiveResult> {
  const db = getDb();
  const campaign = await ownedCampaign(ownerUserId, id);
  let archived = campaign.status === ARCHIVED_CAMPAIGN_STATUS;
  let cancelledPosts = 0;
  try {
    const [changed] = await db.update(campaigns).set({ status: ARCHIVED_CAMPAIGN_STATUS, updatedAt: new Date().toISOString() })
      .where(and(eq(campaigns.id, id), eq(campaigns.ownerUserId, ownerUserId))).returning({ id: campaigns.id });
    if (!changed) throw new CampaignManagementError("Campanha não encontrada.", 404);
    archived = true;
    const scope = and(eq(scheduledPosts.ownerUserId, ownerUserId), eq(scheduledPosts.campaignId, id));
    const now = new Date().toISOString();
    const cancel = db.update(scheduledPosts).set({ status: "cancelled", lockedAt: null, lockToken: null, updatedAt: now })
      .where(and(scope, safelyCancellableCampaignPost()))
      .returning({ id: scheduledPosts.id });
    // Recount from current data, never decrement a stale snapshot or double-click twice.
    const recount = db.update(accounts).set({
      queueCount: sql`(select count(*) from scheduled_posts p join campaigns c on c.id=p.campaign_id and c.owner_user_id=p.owner_user_id
        where p.owner_user_id=${ownerUserId} and p.account_id=${accounts.id} and c.status not in ('archived','cancelled')
          and p.status in (${sql.join(LIVE.map((status) => sql`${status}`), sql`, `)}))`, updatedAt: now,
    }).where(and(eq(accounts.ownerUserId, ownerUserId), sql`${accounts.id} in (select account_id from scheduled_posts where owner_user_id=${ownerUserId} and campaign_id=${id})`));
    const [cancelled] = await db.batch([cancel, recount]);
    cancelledPosts = cancelled.length;
    const [counts] = await db.select({
      protectedPosts: sql<number>`coalesce(sum(case when ${protectedEvidence()} then 1 else 0 end),0)`,
      inFlightPosts: sql<number>`coalesce(sum(case when ${scheduledPosts.status}='processing' or ${scheduledPosts.lockedAt} is not null or nullif(${scheduledPosts.lockToken}, '') is not null then 1 else 0 end),0)`,
      unsettled: sql<number>`coalesce(sum(case when ${scheduledPosts.status} not in ('published','cancelled','processing') and ${scheduledPosts.lockedAt} is null and nullif(${scheduledPosts.lockToken}, '') is null and not ${protectedEvidence()} then 1 else 0 end),0)`,
    }).from(scheduledPosts).where(scope);
    const warnings = await audit(request, { ownerUserId, action: "campaign.archive", entityType: "campaign", entityId: id, summary: `Campanha ${campaign.name} removida da lista; histórico preservado.`, metadata: { cancelledPosts } });
    if (Number(counts.inFlightPosts)) warnings.push("Há envios em processamento. Uma requisição já iniciada pode finalizar; seu recibo e histórico serão preservados.");
    if (Number(counts.protectedPosts)) warnings.push("Publicações confirmadas ou aguardando conferência foram preservadas.");
    if (Number(counts.unsettled)) throw new CampaignManagementError("A campanha foi arquivada, mas alguns estados não puderam ser encerrados. Solicite uma revisão.", 500, true);
    return { campaign: { id, status: "archived" }, archived: true, alreadyArchived: campaign.status === ARCHIVED_CAMPAIGN_STATUS, cancelledPosts, protectedPosts: Number(counts.protectedPosts), inFlightPosts: Number(counts.inFlightPosts), warnings };
  } catch (error) {
    if (error instanceof CampaignManagementError) throw error;
    // The response can fail after a committed archive. Report the persisted outcome
    // when a readback is possible, without claiming the remaining cleanup succeeded.
    if (!archived) {
      try {
        const current = await ownedCampaign(ownerUserId, id);
        archived = current.status === ARCHIVED_CAMPAIGN_STATUS;
      } catch { /* outcome remains unconfirmed; never promise a rollback */ }
    }
    throw new CampaignManagementError(archived ? "A campanha foi arquivada, mas não foi possível concluir a interrupção dos próximos envios. Tente excluir novamente explicitamente." : "Não foi possível confirmar a exclusão da campanha. Atualize a lista antes de tentar novamente.", 500, archived);
  }
}
