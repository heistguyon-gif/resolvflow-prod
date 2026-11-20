import { and, asc, eq, getTableColumns, sql } from "drizzle-orm";
import { getDb } from "../db";
import { auditEvents, campaignMedia, campaigns, scheduledPosts } from "../db/schema";
import { requireWorkspaceContext } from "./auth";
import { isFeatureEnabled } from "./feature-rollouts";
import { isProfileVideoPilot } from "./profile-video-template";
import { getMediaBucket, MAX_MEDIA_BYTES, mediaObjectKey } from "./media-storage";
import { ProfileBindingError, profileObjectAccount, readProfileBinding } from "./profile-video-binding";

// One explicitly authorized recovery, not a general way to remove profile protection.
export const PROFILE_RELEASE_DRAFT = "1fc8029f-5f33-4ca8-a434-a74b859eacd0";
const ACTION = "campaign.release_profile_binding";
type CampaignRow = typeof campaigns.$inferSelect;
type MediaRow = typeof campaignMedia.$inferSelect;
export type ProfileReleasePreview = { workspaceOwnerUserId: string; snapshot: string; count: number; bytes: number; printedName: null };
const conflict = (message: string) => new ProfileBindingError(message);
async function hash(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, "0")).join("");
}
const fingerprint = (campaign: CampaignRow, media: MediaRow[]) => hash(JSON.stringify({ campaign, media }));
async function allowedContext(request: Request) {
  const context = await requireWorkspaceContext(request, "viewer");
  return context.role === "owner" && isProfileVideoPilot({ email: context.email, profileVideoTemplate: isFeatureEnabled("profileVideoTemplate", context.email) }) ? context : null;
}
async function rows(id: string, owner: string) {
  return getDb().select().from(campaignMedia).where(and(eq(campaignMedia.campaignId, id), eq(campaignMedia.ownerUserId, owner))).orderBy(asc(campaignMedia.sortOrder));
}
async function hasQueue(id: string) {
  // Do not join accounts or filter status: even a cancelled/orphaned row blocks conversion.
  return (await getDb().select({ id: scheduledPosts.id }).from(scheduledPosts).where(eq(scheduledPosts.campaignId, id)).limit(1)).length > 0;
}
export async function profileReleasePreview(request: Request, campaign: CampaignRow, binding: string | null): Promise<ProfileReleasePreview | null> {
  if (campaign.id !== PROFILE_RELEASE_DRAFT || campaign.status !== "draft" || !binding) return null;
  const actor = await allowedContext(request);
  if (!actor || actor.workspaceOwnerUserId !== campaign.ownerUserId || await hasQueue(campaign.id)) return null;
  const media = await rows(campaign.id, campaign.ownerUserId);
  const content = media.filter(item => item.purpose === "content");
  return { workspaceOwnerUserId: campaign.ownerUserId, snapshot: await fingerprint(campaign, media), count: content.length, bytes: content.reduce((sum, item) => sum + item.sizeBytes, 0), printedName: null };
}

export async function releaseProfileDraft(request: Request, id: string, payload: Record<string, unknown>) {
  const actor = await allowedContext(request);
  if (!actor) throw new ProfileBindingError("Somente o proprietário participante do piloto pode liberar este rascunho.", 403);
  const owner = actor.workspaceOwnerUserId;
  if (id !== PROFILE_RELEASE_DRAFT) throw conflict("Este rascunho não está autorizado para conversão.");
  if (request.headers.get("x-profile-workspace") !== owner) throw conflict("Workspace alterado. Reabra o rascunho antes de continuar.");
  const operationId = payload.operationId;
  if (typeof operationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId) || typeof payload.snapshot !== "string" || payload.confirm !== true) throw new ProfileBindingError("Confirme a cópia com o snapshot e identificador da operação.", 400);
  const db = getDb();
  const completed = async () => {
    const [event] = await db.select().from(auditEvents).where(eq(auditEvents.id, operationId)).limit(1);
    if (!event) return null;
    if (event.ownerUserId !== owner || event.action !== ACTION || event.entityId !== id) throw conflict("Identificador de operação já utilizado.");
    const metadata = JSON.parse(event.metadataJson || "{}");
    if (metadata.snapshot !== payload.snapshot) throw conflict("Identificador de operação pertence a outra revisão do rascunho.");
    return { released: true, operationId, campaignId: id, mediaCount: metadata.count as number, replay: true };
  };
  const replay = await completed(); if (replay) return replay;
  const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.ownerUserId, owner))).limit(1);
  if (!campaign) throw new ProfileBindingError("Rascunho não encontrado.", 404);
  if (campaign.status !== "draft" || await hasQueue(id)) throw conflict("A conversão exige rascunho sem qualquer publicação na fila ou no histórico.");
  const media = await rows(id, owner);
  if (payload.snapshot !== await fingerprint(campaign, media)) throw conflict("Os arquivos ou a campanha mudaram. Reabra e revise antes de confirmar.");
  const content = media.filter(item => item.purpose === "content");
  if (content.length !== 5 || content.some(item => item.contentType !== "video/mp4" || item.sizeBytes <= 0 || item.sizeBytes > MAX_MEDIA_BYTES)) throw conflict("Esta recuperação foi autorizada para os cinco vídeos MP4 do rascunho.");
  const bucket = getMediaBucket();
  const sourceHeads = new Map<string, R2Object>();
  // Validate every source before the first copy. Covers are preserved, never rewritten.
  for (const item of media) {
    const object = await bucket.head(item.objectKey);
    if (!object || object.customMetadata?.ownerUserId !== owner || object.size !== item.sizeBytes || object.httpMetadata?.contentType !== item.contentType) throw conflict("Mídia ausente ou diferente do snapshot. Nenhuma referência foi alterada.");
    sourceHeads.set(item.objectKey, object);
  }
  const binding = await readProfileBinding(media, owner, async key => sourceHeads.get(key) || null);
  if (!binding) throw conflict("O rascunho não possui vínculo de perfil para liberar.");
  const deadline = Date.now() + 90_000;
  const copied: MediaRow[] = [];
  for (const item of content) {
    if (request.signal.aborted || Date.now() >= deadline) throw conflict(`Cópia interrompida. Operação ${operationId}; confira o estado, sem repetir automaticamente.`);
    const source = sourceHeads.get(item.objectKey)!;
    const digest = await hash(`${operationId}:${item.id}`);
    const newId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
    const objectKey = mediaObjectKey(newId);
    const metadata = { ownerUserId: owner, fileName: encodeURIComponent(item.fileName), sizeBytes: String(item.sizeBytes), releaseOperationId: operationId, releaseCampaignId: id, releaseActorId: actor.accountUserId, releaseSourceKey: item.objectKey, releaseSourceEtag: source.etag };
    const matches = (object: R2Object | null) => !!object && object.size === item.sizeBytes && object.httpMetadata?.contentType === item.contentType && profileObjectAccount(object, owner) === null && Object.entries(metadata).every(([key, value]) => object.customMetadata?.[key] === value);
    const existing = await bucket.head(objectKey);
    if (existing) {
      if (!matches(existing)) throw conflict("Cópia existente incompatível. Nenhum objeto foi sobrescrito.");
    } else {
      const body = await bucket.get(item.objectKey, { onlyIf: { etagMatches: source.etag } });
      if (!body || !("body" in body)) throw conflict("O arquivo original mudou durante a cópia. Nenhuma referência foi alterada.");
      const written = await bucket.put(objectKey, body.body, { onlyIf: new Headers({ "If-None-Match": "*" }), httpMetadata: { ...source.httpMetadata, contentType: item.contentType }, customMetadata: metadata });
      // A racing identical operation can have completed the same create-only copy.
      if (!matches(written || await bucket.head(objectKey))) throw conflict("Não foi possível confirmar a cópia. Confira a operação antes de repetir.");
    }
    copied.push({ ...item, id: newId, objectKey, publicUrl: `${new URL(request.url).origin}/api/media/${newId}` });
  }
  if (request.signal.aborted || Date.now() >= deadline) throw conflict("Tempo de cópia excedido. Originais e rascunho preservados; confira o estado antes de repetir.");
  // Exact media/campaign snapshot, checked in the same transaction as replacement.
  const campaignMatch = and(...Object.entries(getTableColumns(campaigns)).map(([key, column]) => { const value = campaign[key as keyof CampaignRow]; return sql`${column} is ${typeof value === "boolean" ? Number(value) : value}`; }));
  const mediaMismatch = sql.join(Object.entries(getTableColumns(campaignMedia)).map(([key, column]) => sql`m.${sql.identifier(column.name)} is not json_extract(j.value, ${`$.${key}`})`), sql` or `);
  const unchanged = sql`exists(select 1 from campaigns where ${campaignMatch})
    and not exists(select 1 from scheduled_posts where campaign_id=${id})
    and (select count(*) from campaign_media where campaign_id=${id})=${media.length}
    and not exists(select 1 from json_each(${JSON.stringify(media)}) j left join campaign_media m on m.id=json_extract(j.value,'$.id') where m.id is null or ${mediaMismatch})`;
  // The execution nonce prevents a concurrent replay's existing audit row from authorizing this batch.
  const auditJson = JSON.stringify({ executionId: crypto.randomUUID(), snapshot: payload.snapshot, count: copied.length, sourceAccountId: binding, mediaIds: copied.map(item => item.id) });
  const authorized = sql`exists(select 1 from audit_events where id=${operationId} and owner_user_id=${owner} and metadata_json=${auditJson})`;
  const auditInsert = db.insert(auditEvents).select(sql`select ${operationId}, ${owner}, ${actor.accountUserId}, ${actor.email}, ${ACTION}, 'campaign', ${id}, 'Cópias sem vínculo criadas para o rascunho autorizado; originais preservados.', ${auditJson}, ${new Date().toISOString()} where ${unchanged}`);
  const mediaColumns = getTableColumns(campaignMedia);
  const inserts = copied.map(item => db.insert(campaignMedia).select(sql`select ${sql.join(Object.keys(mediaColumns).map(key => sql`${item[key as keyof MediaRow]}`), sql`, `)} where ${authorized}`));
  try {
    await db.batch([
      auditInsert,
      db.delete(campaignMedia).where(and(eq(campaignMedia.campaignId, id), eq(campaignMedia.ownerUserId, owner), eq(campaignMedia.purpose, "content"), authorized)),
      ...inserts,
      db.update(campaigns).set({ mediaUrl: copied[0].publicUrl, updatedAt: new Date().toISOString() }).where(and(eq(campaigns.id, id), eq(campaigns.ownerUserId, owner), authorized)),
    ]);
  } catch {
    const confirmed = await completed(); if (confirmed) return confirmed;
    throw conflict(`Não foi possível confirmar a conversão. Operação ${operationId}. Confira o detalhe; não repita automaticamente. As cópias foram preservadas.`);
  }
  const confirmed = await completed();
  if (!confirmed) throw conflict("A campanha ou a fila mudou durante a cópia. Conversão não aplicada; cópias e originais preservados.");
  return { ...confirmed, replay: false };
}
