import { authErrorResponse, requireWorkspaceContext } from "../../../../lib/auth";
import { getMediaBucket, MAX_MEDIA_BYTES, mediaObjectKey } from "../../../../lib/media-storage";
import { isFeatureEnabled } from "../../../../lib/feature-rollouts";
import { assertProfileUploadReplay, ProfileBindingError } from "../../../../lib/profile-video-binding";
import { requireReadyProfileAccount } from "../../../../lib/profile-video-binding-runtime";

const SUPPORTED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "video/mp4", "video/quicktime"]);

export async function POST(request: Request) {
  try {
    const context = await requireWorkspaceContext(request, "editor");
    const ownerUserId = context.workspaceOwnerUserId;
    if (request.headers.has("x-profile-workspace") && request.headers.get("x-profile-workspace") !== ownerUserId) throw new ProfileBindingError("Workspace alterado. Revise os perfis antes de enviar.");
    const profileAccountId = request.headers.get("x-profile-account-id") || null;
    if (profileAccountId) {
      if (!isFeatureEnabled("profileVideoTemplate", context.email)) return Response.json({ error: "Template de perfil indisponível." }, { status: 403 });
      if (request.headers.get("x-profile-workspace") !== ownerUserId) throw new ProfileBindingError("Workspace alterado. Revise os perfis antes de enviar.");
      await requireReadyProfileAccount(ownerUserId, profileAccountId);
    }
    const url = new URL(request.url);
    const fileName = (url.searchParams.get("name") || "midia").slice(0, 180);
    const contentType = (request.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (profileAccountId && contentType !== "video/mp4") throw new ProfileBindingError("Template por perfil aceita somente saídas MP4.", 415);
    const sizeBytes = Number(request.headers.get("content-length") || request.headers.get("x-file-size") || 0);
    if (!request.body || !SUPPORTED_MEDIA_TYPES.has(contentType)) {
      return Response.json({ error: "Use uma imagem JPG/PNG ou um vídeo MP4/MOV." }, { status: 415 });
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_MEDIA_BYTES) {
      return Response.json({ error: "Cada arquivo precisa ter até 100 MB." }, { status: 400 });
    }
    const requestedUploadId = request.headers.get("x-upload-id")?.trim() || "";
    if (requestedUploadId && !/^[0-9a-f-]{36}$/i.test(requestedUploadId)) {
      return Response.json({ error: "Identificador de upload invalido." }, { status: 400 });
    }
    // The client keeps this id across retries. If the connection drops after R2
    // accepts the body, the next attempt overwrites the same object instead of
    // creating an orphan for every retry.
    const id = requestedUploadId || crypto.randomUUID();
    const objectKey = mediaObjectKey(id);
    const bucket = getMediaBucket();
    let condition = new Headers({ "If-None-Match": "*" });
    {
      const existing = await bucket.head(objectKey);
      if (existing && existing.customMetadata?.ownerUserId !== ownerUserId) {
        return Response.json({ error: "Identificador de upload indisponivel." }, { status: 409 });
      }
      if (existing && (profileAccountId || "profileAccountId" in (existing.customMetadata || {}) || "profileBindingVersion" in (existing.customMetadata || {}))) {
        assertProfileUploadReplay(existing, ownerUserId, profileAccountId, sizeBytes, contentType, fileName);
        return Response.json({ id, fileName, contentType, sizeBytes, url: `${url.origin}/api/media/${id}` }, { status: 200 });
      }
      // Legacy retries keep their overwrite semantics, guarded against a racing binding.
      if (existing) condition = new Headers({ "If-Match": existing.httpEtag });
    }
    const written = await bucket.put(objectKey, request.body, {
      onlyIf: condition,
      httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { ownerUserId, fileName: encodeURIComponent(fileName), sizeBytes: String(sizeBytes), ...(profileAccountId ? { profileAccountId, profileBindingVersion: "1" } : {}) },
    });
    if (!written) throw new ProfileBindingError("Outro upload ocupou este identificador. Nenhum objeto foi sobrescrito; confira o resultado antes de repetir.");
    return Response.json({ id, fileName, contentType, sizeBytes, url: `${url.origin}/api/media/${id}` }, { status: 201 });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    if (error instanceof ProfileBindingError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível enviar a mídia." }, { status: 500 });
  }
}
