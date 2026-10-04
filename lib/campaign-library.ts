import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { campaignMedia, campaigns } from "../db/schema";
import { importedTemplateName } from "./imported-template-name";

const MEDIA_BATCH = 8;

export { importedTemplateName };

export async function copyCampaignAsTemplate(sourceCampaignId: string, targetOwnerUserId: string, ownerLabel: string) {
  const db = getDb();
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, sourceCampaignId)).limit(1);
  if (!campaign) return { error: "Campanha não encontrada.", status: 404 as const };
  if (campaign.ownerUserId === targetOwnerUserId) return { error: "Essa campanha já está na sua conta.", status: 409 as const };
  const sourceMedia = await db.select().from(campaignMedia).where(and(eq(campaignMedia.ownerUserId, campaign.ownerUserId), eq(campaignMedia.campaignId, campaign.id))).orderBy(asc(campaignMedia.sortOrder));
  if (!sourceMedia.length) return { error: "Essa campanha não tem arquivos para virar template.", status: 409 as const };
  const templateId = crypto.randomUUID();
  const idMap = new Map(sourceMedia.map((item) => [item.id, crypto.randomUUID()]));
  const [template] = await db.insert(campaigns).values({
    id: templateId,
    ownerUserId: targetOwnerUserId,
    name: importedTemplateName(campaign.name, ownerLabel),
    mediaType: campaign.mediaType,
    metaApiVersion: campaign.metaApiVersion,
    mediaUrl: campaign.mediaUrl,
    mediaCount: campaign.mediaCount,
    coverMediaId: campaign.coverMediaId ? idMap.get(campaign.coverMediaId) ?? null : null,
    caption: campaign.caption,
    captionVariations: campaign.captionVariations,
    hashtags: campaign.hashtags,
    shareToFeed: campaign.shareToFeed,
    distributionMode: campaign.distributionMode,
    mediaOrder: campaign.mediaOrder,
    repeatCount: campaign.repeatCount,
    respectDailyLimit: campaign.respectDailyLimit,
    status: "template",
    timezone: campaign.timezone,
    startAt: null,
    stopAt: null,
    intervalMinutes: campaign.intervalMinutes,
    totalAccounts: 0,
    publishedCount: 0,
    failedCount: 0,
  }).returning();
  const copiedMedia = sourceMedia.map((item) => ({
    id: idMap.get(item.id)!,
    ownerUserId: targetOwnerUserId,
    campaignId: templateId,
    objectKey: item.objectKey,
    fileName: item.fileName,
    contentType: item.contentType,
    sizeBytes: item.sizeBytes,
    publicUrl: item.publicUrl,
    purpose: item.purpose,
    caption: item.caption,
    sortOrder: item.sortOrder,
  }));
  try {
    for (let index = 0; index < copiedMedia.length; index += MEDIA_BATCH) await db.insert(campaignMedia).values(copiedMedia.slice(index, index + MEDIA_BATCH));
  } catch (error) {
    try { await db.delete(campaigns).where(and(eq(campaigns.id, templateId), eq(campaigns.ownerUserId, targetOwnerUserId))); } catch { /* preserva a falha original */ }
    throw error;
  }
  return { template, sourceOwnerUserId: campaign.ownerUserId, media: copiedMedia.length };
}
