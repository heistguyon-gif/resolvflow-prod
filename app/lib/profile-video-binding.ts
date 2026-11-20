/** Durable identity belongs to the R2 object, including shared template copies. */
export class ProfileBindingError extends Error {
  status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}
export type ProfileMediaObject = { customMetadata?: Record<string, string>; httpMetadata?: { contentType?: string }; size: number };
export function profileObjectAccount(object: ProfileMediaObject | null, ownerUserId: string): string | null {
  if (!object) throw new ProfileBindingError("Mídia indisponível. Não foi possível conferir o vínculo do perfil.");
  const meta = object.customMetadata || {};
  if (!("profileAccountId" in meta) && !("profileBindingVersion" in meta)) return null;
  if (meta.profileBindingVersion !== "1" || !meta.profileAccountId || meta.ownerUserId !== ownerUserId) {
    throw new ProfileBindingError("Vínculo de perfil inválido ou de outro workspace. Esta mídia não pode ser reutilizada aqui.");
  }
  return meta.profileAccountId;
}
export function assertProfileDistribution(accountId: string | null, distributionMode?: unknown, intervalMode?: unknown) {
  if (accountId && (distributionMode === "distribute" || intervalMode === "global_queue")) {
    throw new ProfileBindingError("Template por perfil usa campanhas independentes. Escolha todas as mídias para o perfil e intervalo por perfil; distribuição e fila global não são suportadas.");
  }
}
export function assertProfileSchedule(accountId: string | null, accountIds: readonly string[], distributionMode?: unknown, intervalMode?: unknown) {
  assertProfileDistribution(accountId, distributionMode, intervalMode);
  if (accountId && (accountIds.length !== 1 || accountIds[0] !== accountId)) throw new ProfileBindingError("Esta campanha pertence a um único perfil. Selecione somente a conta vinculada aos vídeos.");
}
export async function readProfileBinding(
  media: readonly { objectKey: string; purpose?: string }[], ownerUserId: string,
  head: (key: string) => Promise<ProfileMediaObject | null>,
) {
  const content = media.filter(item => !item.purpose || item.purpose === "content");
  const bindings: (string | null)[] = [];
  for (let i = 0; i < content.length; i += 4) {
    bindings.push(...await Promise.all(content.slice(i, i + 4).map(async item => profileObjectAccount(await head(item.objectKey), ownerUserId))));
  }
  const tagged = bindings.filter((id): id is string => !!id);
  if (!tagged.length) return null;
  if (tagged.length !== bindings.length || new Set(tagged).size !== 1) throw new ProfileBindingError("Não misture variantes de perfis ou vídeos sem vínculo na mesma campanha.");
  return tagged[0];
}
export async function assertProfileTransferable(media: readonly { objectKey: string }[], head: (key: string) => Promise<ProfileMediaObject | null>) {
  const keys = [...new Set(media.map(item => item.objectKey))];
  for (let i = 0; i < keys.length; i += 4) {
    const objects = await Promise.all(keys.slice(i, i + 4).map(head));
    if (objects.some(object => !object)) throw new ProfileBindingError("Mídia indisponível. Importação interrompida antes de criar o template.");
    if (objects.some(object => "profileAccountId" in (object?.customMetadata || {}) || "profileBindingVersion" in (object?.customMetadata || {}))) throw new ProfileBindingError("Template vinculado a um perfil não pode ser transferido para outro workspace. Use os vídeos originais.");
  }
}
/** Existing objects are immutable: retries may confirm, never replace or strip a binding. */
export function assertProfileUploadReplay(object: ProfileMediaObject, owner: string, accountId: string | null, size: number, contentType: string, fileName: string) {
  if (object.customMetadata?.ownerUserId !== owner || profileObjectAccount(object, owner) !== accountId || object.size !== size || object.httpMetadata?.contentType !== contentType || object.customMetadata?.fileName !== encodeURIComponent(fileName)) {
    throw new ProfileBindingError("Identificador de upload já usado para outra mídia ou outro perfil. O objeto original foi preservado.");
  }
}
