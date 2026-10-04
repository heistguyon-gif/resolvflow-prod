import { env } from "cloudflare:workers";

export const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
export const MAX_CAMPAIGN_MEDIA = 50;

export function getMediaBucket() {
  const bucket = (env as unknown as { MEDIA?: R2Bucket }).MEDIA;
  if (!bucket) throw new Error("O armazenamento de mídia ainda não está disponível.");
  return bucket;
}

export function mediaObjectKey(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Identificador de mídia inválido.");
  return `campaign-media/${id}`;
}

export function profileAvatarKey(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Identificador de foto inválido.");
  return `profile-avatars/${id}`;
}

export function validCampaignContentType(mediaType: string, contentType: string) {
  if (mediaType === "IMAGE") return ["image/jpeg", "image/png"].includes(contentType);
  if (mediaType === "REELS") return ["video/mp4", "video/quicktime"].includes(contentType);
  if (mediaType === "STORIES") return ["image/jpeg", "video/mp4", "video/quicktime"].includes(contentType);
  return false;
}
