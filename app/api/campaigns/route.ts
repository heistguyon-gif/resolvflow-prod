import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "../../../db";
import { campaignMedia, campaigns } from "../../../db/schema";
import { authErrorResponse, requireOwnerId } from "../../../lib/auth";
import { getMediaBucket, MAX_CAMPAIGN_MEDIA, mediaObjectKey, validCampaignContentType } from "../../../lib/media-storage";
import { parseCaptionVariations } from "../../../lib/caption-variations";
import { recordAuditEvent } from "../../../lib/audit";
import { reconcileFinishedCampaigns } from "../../../lib/queue-reconcile";

const CAMPAIGN_MEDIA_INSERT_BATCH_SIZE = 8;

function normalizeD1Timestamp(value: string | null) {
  if (!value) return value;
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
}

function normalizeCampaignDates<T extends { createdAt: string; updatedAt: string }>(campaign: T) {
  return {
    ...campaign,
    createdAt: normalizeD1Timestamp(campaign.createdAt),
    updatedAt: normalizeD1Timestamp(campaign.updatedAt),
  };
}

export async function GET(request: Request) {
  try {
    const ownerUserId = await requireOwnerId(request, "viewer");
    await reconcileFinishedCampaigns(ownerUserId).catch(() => 0);
    const [rows, templates] = await Promise.all([
      getDb().select().from(campaigns).where(and(eq(campaigns.ownerUserId, ownerUserId), ne(campaigns.status, "template"))).orderBy(desc(campaigns.createdAt)).limit(100),
      getDb().select().from(campaigns).where(and(eq(campaigns.ownerUserId, ownerUserId), eq(campaigns.status, "template"))).orderBy(desc(campaigns.createdAt)).limit(100),
    ]);
    return Response.json({ campaigns: rows.map(normalizeCampaignDates), templates: templates.map(normalizeCampaignDates) });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar as campanhas." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ownerUserId = await requireOwnerId(request);
    const payload = await request.json() as { templateId?: string; name?: string; mediaType?: string; metaApiVersion?: string | null; mediaIds?: string[]; coverMediaId?: string; coverMediaIds?: string[]; caption?: string; captionVariations?: unknown; mediaCaptions?: Record<string, string>; hashtags?: string; shareToFeed?: boolean; timezone?: string; mediaOrder?: string; distributionMode?: string; repeatCount?: number; intervalMinutes?: number; respectDailyLimit?: boolean };
    const name = payload.name?.trim() ?? ""; const mediaType = payload.mediaType?.toUpperCase() ?? "IMAGE";
    if (!name || name.length > 120) return Response.json({ error: "Informe um nome de campanha com até 120 caracteres." }, { status: 400 });
    if (!(["IMAGE", "REELS", "STORIES"] as string[]).includes(mediaType)) return Response.json({ error: "Tipo de mídia inválido." }, { status: 400 });
    if (payload.templateId) {
      const db = getDb();
      const [template] = await db.select().from(campaigns).where(and(eq(campaigns.id, payload.templateId), eq(campaigns.ownerUserId, ownerUserId), eq(campaigns.status, "template"))).limit(1);
      if (!template) return Response.json({ error: "Template não encontrado." }, { status: 404 });
      const sourceMedia = await db.select().from(campaignMedia).where(and(eq(campaignMedia.ownerUserId, ownerUserId), eq(campaignMedia.campaignId, template.id))).orderBy(campaignMedia.sortOrder);
      if (!sourceMedia.length) return Response.json({ error: "O template não possui arquivos." }, { status: 409 });
      const campaignId = crypto.randomUUID();
      const idMap = new Map(sourceMedia.map((item) => [item.id, crypto.randomUUID()]));
      const captionVariations = JSON.stringify(parseCaptionVariations(payload.captionVariations ?? template.captionVariations));
      const mediaCaptions = payload.mediaCaptions || {};
      const [campaign] = await db.insert(campaigns).values({
        id: campaignId, ownerUserId, name, mediaType: template.mediaType, metaApiVersion: template.metaApiVersion, mediaUrl: template.mediaUrl,
        mediaCount: template.mediaCount, coverMediaId: template.coverMediaId ? idMap.get(template.coverMediaId) ?? null : null,
        caption: typeof payload.caption === "string" ? payload.caption.slice(0, 10_000) : template.caption, captionVariations,
        hashtags: typeof payload.hashtags === "string" ? payload.hashtags.trim().slice(0, 1_000) : template.hashtags,
        shareToFeed: typeof payload.shareToFeed === "boolean" ? payload.shareToFeed : template.shareToFeed,
        distributionMode: payload.distributionMode === "distribute" ? "distribute" : template.distributionMode,
        mediaOrder: payload.mediaOrder === "random" ? "random" : payload.mediaOrder === "sequential" ? "sequential" : template.mediaOrder,
        repeatCount: Math.min(10, Math.max(1, Number(payload.repeatCount) || template.repeatCount)),
        intervalMinutes: Math.min(1440, Math.max(5, Number(payload.intervalMinutes) || template.intervalMinutes)),
        respectDailyLimit: typeof payload.respectDailyLimit === "boolean" ? payload.respectDailyLimit : template.respectDailyLimit,
        timezone: payload.timezone || template.timezone, status: "draft", startAt: null, stopAt: null, totalAccounts: 0, publishedCount: 0, failedCount: 0,
      }).returning();
      const copiedMedia = sourceMedia.map((item) => ({
        id: idMap.get(item.id)!, ownerUserId, campaignId, objectKey: item.objectKey, fileName: item.fileName, contentType: item.contentType,
        sizeBytes: item.sizeBytes, publicUrl: item.publicUrl, purpose: item.purpose, caption: (mediaCaptions[item.id] ?? item.caption).slice(0, 10_000), sortOrder: item.sortOrder,
      }));
      try {
        for (let index = 0; index < copiedMedia.length; index += CAMPAIGN_MEDIA_INSERT_BATCH_SIZE) await db.insert(campaignMedia).values(copiedMedia.slice(index, index + CAMPAIGN_MEDIA_INSERT_BATCH_SIZE));
      } catch (error) {
        try { await db.delete(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.ownerUserId, ownerUserId))); } catch { /* preserva a falha original */ }
        throw error;
      }
      await recordAuditEvent(request, { ownerUserId, action: "campaign.create_from_template", entityType: "campaign", entityId: campaignId, summary: `Rascunho “${name}” criado a partir do template.`, metadata: { templateId: template.id, media: copiedMedia.length } });
      return Response.json({ campaign }, { status: 201 });
    }
    const mediaIds = [...new Set(payload.mediaIds ?? [])].slice(0, MAX_CAMPAIGN_MEDIA);
    if (!mediaIds.length) return Response.json({ error: "Selecione pelo menos um arquivo para a campanha." }, { status: 400 });
    const bucket = getMediaBucket(); const url = new URL(request.url);
    const uploaded = [] as Array<{ id: string; objectKey: string; fileName: string; contentType: string; sizeBytes: number; publicUrl: string }>;
    for (const id of mediaIds) {
      const objectKey = mediaObjectKey(id); const object = await bucket.head(objectKey);
      if (!object || object.customMetadata?.ownerUserId !== ownerUserId) return Response.json({ error: "Um dos arquivos enviados não foi encontrado. Selecione os arquivos novamente." }, { status: 400 });
      const contentType = object.httpMetadata?.contentType || "application/octet-stream";
      if (!validCampaignContentType(mediaType, contentType)) return Response.json({ error: mediaType === "IMAGE" ? "Campanhas de imagem aceitam JPG ou PNG." : mediaType === "REELS" ? "Campanhas de Reel aceitam vídeos MP4 ou MOV." : "Stories de imagem aceitam apenas JPG. Stories de vídeo aceitam MP4 ou MOV." }, { status: 400 });
      let fileName = "midia"; try { fileName = decodeURIComponent(object.customMetadata?.fileName || "midia"); } catch { /* mantém o nome seguro */ }
      uploaded.push({ id, objectKey, fileName, contentType, sizeBytes: object.size, publicUrl: `${url.origin}/api/media/${id}` });
    }
    const coverIds = [...new Set((payload.coverMediaIds?.length ? payload.coverMediaIds : payload.coverMediaId ? [payload.coverMediaId] : []))].slice(0, 24);
    const covers: Array<{ id: string; objectKey: string; fileName: string; contentType: string; sizeBytes: number; publicUrl: string }> = [];
    if (mediaType === "REELS") {
      for (const coverId of coverIds) {
        const objectKey = mediaObjectKey(coverId); const object = await bucket.head(objectKey);
        const contentType = object?.httpMetadata?.contentType || "";
        if (!object || object.customMetadata?.ownerUserId !== ownerUserId || !["image/jpeg", "image/png"].includes(contentType)) return Response.json({ error: "Cada capa do Reel precisa ser uma imagem JPG ou PNG válida." }, { status: 400 });
        let fileName = "capa"; try { fileName = decodeURIComponent(object.customMetadata?.fileName || "capa"); } catch { /* mantém o nome seguro */ }
        covers.push({ id: coverId, objectKey, fileName, contentType, sizeBytes: object.size, publicUrl: `${url.origin}/api/media/${coverId}` });
      }
    }
    const campaignId = crypto.randomUUID(); const db = getDb();
    const metaApiVersion = mediaType === "REELS" && payload.metaApiVersion === "v23.0" ? "v23.0" : null;
    const caption = payload.caption?.slice(0, 10_000) ?? "";
    const captionVariations = JSON.stringify(parseCaptionVariations(payload.captionVariations));
    const mediaCaptions = payload.mediaCaptions || {};
    const hashtags = payload.hashtags?.trim().slice(0, 1_000) ?? "";
    const mediaOrder = payload.mediaOrder === "random" ? "random" : "sequential";
    const [campaign] = await db.insert(campaigns).values({ id: campaignId, ownerUserId, name, mediaType, metaApiVersion, mediaUrl: uploaded[0].publicUrl, mediaCount: uploaded.length, coverMediaId: covers[0]?.id ?? null, caption, captionVariations, hashtags, shareToFeed: Boolean(payload.shareToFeed), timezone: payload.timezone || "America/Sao_Paulo", mediaOrder, status: "draft" }).returning();
    const mediaRows = [
      ...uploaded.map((item, sortOrder) => ({ id: item.id, ownerUserId, campaignId, objectKey: item.objectKey, fileName: item.fileName, contentType: item.contentType, sizeBytes: item.sizeBytes, publicUrl: item.publicUrl, purpose: "content", caption: (mediaCaptions[item.id] || "").slice(0, 10_000), sortOrder })),
      ...covers.map((cover, index) => ({ id: cover.id, ownerUserId, campaignId, objectKey: cover.objectKey, fileName: cover.fileName, contentType: cover.contentType, sizeBytes: cover.sizeBytes, publicUrl: cover.publicUrl, purpose: "cover", caption: "", sortOrder: -1 - index })),
    ];
    try {
      for (let index = 0; index < mediaRows.length; index += CAMPAIGN_MEDIA_INSERT_BATCH_SIZE) {
        await db.insert(campaignMedia).values(mediaRows.slice(index, index + CAMPAIGN_MEDIA_INSERT_BATCH_SIZE));
      }
    } catch (error) {
      try { await db.delete(campaigns).where(eq(campaigns.id, campaignId)); } catch { /* preserva a falha original */ }
      throw error;
    }
    await recordAuditEvent(request, { ownerUserId, action: "campaign.create", entityType: "campaign", entityId: campaignId, summary: `Rascunho “${name}” criado com ${uploaded.length} arquivo(s).`, metadata: { mediaType, mediaCount: uploaded.length } });
    return Response.json({ campaign }, { status: 201 });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível criar a campanha." }, { status: 500 });
  }
}
