import { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { appUsers, auditEvents, campaignMedia, campaigns, workspaceMembers, workspaces } from "../db/schema";
import type { WorkspaceContext } from "./auth";
import { getMediaBucket } from "./media-storage";

export class TemplateTransferError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function recipients(ownerUserId: string) {
  return getDb().selectDistinct({ ownerUserId: workspaces.id, workspaceName: workspaces.name,
    name: appUsers.displayName, email: appUsers.email })
    .from(workspaces).innerJoin(workspaceMembers, eq(workspaceMembers.workspaceOwnerUserId, workspaces.id))
    .innerJoin(appUsers, or(eq(workspaceMembers.accountUserId, appUsers.id),
      and(sql`${workspaceMembers.accountUserId} is null`, eq(sql`lower(${workspaceMembers.email})`, sql`lower(${appUsers.email})`))))
    .where(and(ne(workspaces.id, ownerUserId), eq(workspaces.status, "active"),
      eq(workspaceMembers.status, "active"), eq(workspaceMembers.role, "owner"), eq(appUsers.status, "active")))
    .orderBy(asc(appUsers.displayName), asc(workspaces.name));
}

export async function templateTransferOptions(ownerUserId: string) {
  const [templates, destinations] = await Promise.all([
    getDb().select({ id: campaigns.id, name: campaigns.name, mediaCount: campaigns.mediaCount, mediaType: campaigns.mediaType })
      .from(campaigns).where(and(eq(campaigns.ownerUserId, ownerUserId), eq(campaigns.status, "template")))
      .orderBy(desc(campaigns.updatedAt)),
    recipients(ownerUserId),
  ]);
  return { templates, destinations };
}

export async function transferCampaignTemplate(ctx: WorkspaceContext, payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TemplateTransferError("Escolha o template e a conta de destino.");
  const { sourceCampaignId, targetOwnerUserId, requestId } = payload as Record<string, unknown>;
  if (typeof sourceCampaignId !== "string" || !sourceCampaignId || sourceCampaignId.length > 180
    || typeof targetOwnerUserId !== "string" || !targetOwnerUserId || targetOwnerUserId.length > 180
    || typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new TemplateTransferError("Seleção inválida. Escolha novamente o template e a conta de destino.");
  }
  if (targetOwnerUserId === ctx.workspaceOwnerUserId) throw new TemplateTransferError("Escolha outra conta para receber a cópia.");
  const db = getDb(), receiptId = `template-transfer:${requestId}`;
  const metadataJson = JSON.stringify({ sourceCampaignId, sourceOwnerUserId: ctx.workspaceOwnerUserId, targetOwnerUserId });
  const replay = async () => {
    const [receipt] = await db.select().from(auditEvents).where(eq(auditEvents.id, receiptId)).limit(1);
    if (!receipt) return null;
    if (receipt.actorUserId !== ctx.accountUserId || receipt.metadataJson !== metadataJson
      || receipt.ownerUserId !== targetOwnerUserId || receipt.action !== "campaign.send_template") {
      throw new TemplateTransferError("Esta solicitação já foi usada para outro envio.", 409);
    }
    const [template] = await db.select({ id: campaigns.id, name: campaigns.name, status: campaigns.status }).from(campaigns)
      .where(and(eq(campaigns.id, requestId), eq(campaigns.ownerUserId, targetOwnerUserId))).limit(1);
    if (!template || template.status !== "template") throw new TemplateTransferError("Este envio já foi concluído, mas a cópia não está mais disponível como template na conta de destino.", 410);
    return { template: { id: template.id, name: template.name }, replay: true };
  };
  const previous = await replay();
  if (previous) return previous;
  const target = (await recipients(ctx.workspaceOwnerUserId)).find((row) => row.ownerUserId === targetOwnerUserId);
  if (!target) throw new TemplateTransferError("A conta de destino não está disponível ou está desativada.", 409);
  const [source] = await db.select().from(campaigns).where(and(eq(campaigns.id, sourceCampaignId),
    eq(campaigns.ownerUserId, ctx.workspaceOwnerUserId), eq(campaigns.status, "template"))).limit(1);
  if (!source) throw new TemplateTransferError("Template não encontrado na sua conta. Atualize a lista.", 404);
  const media = await db.select().from(campaignMedia).where(and(eq(campaignMedia.campaignId, source.id),
    eq(campaignMedia.ownerUserId, ctx.workspaceOwnerUserId))).orderBy(asc(campaignMedia.sortOrder));
  const content = media.filter((item) => item.purpose === "content");
  if (!content.length) throw new TemplateTransferError("Este template não tem vídeos ou imagens para enviar.", 409);
  if (source.coverMediaId && !media.some((item) => item.id === source.coverMediaId && item.purpose === "cover")) {
    throw new TemplateTransferError("A capa deste template está incompleta. Revise o template antes de enviar.", 409);
  }
  const keys = [...new Set(media.map((item) => item.objectKey))];
  const bucket = getMediaBucket();
  for (let offset = 0; offset < keys.length; offset += 4) {
    const objects = await Promise.all(keys.slice(offset, offset + 4).map((key) => bucket.head(key)));
    if (objects.some((object) => !object)) throw new TemplateTransferError("Um arquivo deste template não está mais disponível. Revise os vídeos e capas antes de enviar.", 409);
    if (objects.some(object => "profileAccountId" in (object?.customMetadata || {}) || "profileBindingVersion" in (object?.customMetadata || {}))) throw new TemplateTransferError("Template vinculado a um perfil não pode ser transferido para outro workspace. Use os vídeos originais para criar outro template.", 409);
  }
  const ids = new Map(media.map((item) => [item.id, crypto.randomUUID()]));
  const template = { id: requestId, ownerUserId: targetOwnerUserId, name: source.name,
    mediaType: source.mediaType, mediaUrl: content[0].publicUrl, mediaCount: content.length,
    metaApiVersion: source.metaApiVersion, coverMediaId: source.coverMediaId ? ids.get(source.coverMediaId)! : null,
    caption: source.caption, captionVariations: source.captionVariations, hashtags: source.hashtags,
    shareToFeed: source.shareToFeed, distributionMode: source.distributionMode, mediaOrder: source.mediaOrder,
    repeatCount: source.repeatCount, respectDailyLimit: source.respectDailyLimit, timezone: source.timezone,
    intervalMinutes: source.intervalMinutes, status: "template", startAt: null, stopAt: null,
    totalAccounts: 0, publishedCount: 0, failedCount: 0 };
  const copied = media.map((item) => ({ id: ids.get(item.id)!, ownerUserId: targetOwnerUserId, campaignId: requestId,
    objectKey: item.objectKey, publicUrl: item.publicUrl, fileName: item.fileName, contentType: item.contentType,
    sizeBytes: item.sizeBytes, purpose: item.purpose, caption: item.caption, sortOrder: item.sortOrder }));
  const statements = [db.insert(campaigns).values(template)];
  const mediaStatements = [];
  for (let offset = 0; offset < copied.length; offset += 8) mediaStatements.push(db.insert(campaignMedia).values(copied.slice(offset, offset + 8)));
  try {
    // The destination, media references and durable receipt succeed or roll back together.
    await db.batch([statements[0], ...mediaStatements, db.insert(auditEvents).values({ id: receiptId,
      ownerUserId: targetOwnerUserId, actorUserId: ctx.accountUserId, actorEmail: ctx.email,
      action: "campaign.send_template", entityType: "campaign", entityId: requestId,
      summary: "Template recebido por cópia da conta principal.", metadataJson })]);
  } catch {
    const completed = await replay();
    if (completed) return completed;
    throw new TemplateTransferError("Não foi possível confirmar o envio. Tente novamente com a mesma seleção para conferir sem duplicar.", 503);
  }
  return { template: { id: template.id, name: template.name }, replay: false };
}
