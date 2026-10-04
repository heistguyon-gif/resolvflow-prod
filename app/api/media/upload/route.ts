import { authErrorResponse, requireOwnerId } from "../../../../lib/auth";
import { getMediaBucket, MAX_MEDIA_BYTES, mediaObjectKey } from "../../../../lib/media-storage";

const SUPPORTED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "video/mp4", "video/quicktime"]);

export async function POST(request: Request) {
  try {
    const ownerUserId = await requireOwnerId(request);
    const url = new URL(request.url);
    const fileName = (url.searchParams.get("name") || "midia").slice(0, 180);
    const contentType = (request.headers.get("content-type") || "").split(";")[0].toLowerCase();
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
    if (requestedUploadId) {
      const existing = await bucket.head(objectKey);
      if (existing && existing.customMetadata?.ownerUserId !== ownerUserId) {
        return Response.json({ error: "Identificador de upload indisponivel." }, { status: 409 });
      }
    }
    await bucket.put(objectKey, request.body, {
      httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { ownerUserId, fileName: encodeURIComponent(fileName), sizeBytes: String(sizeBytes) },
    });
    return Response.json({ id, fileName, contentType, sizeBytes, url: `${url.origin}/api/media/${id}` }, { status: 201 });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível enviar a mídia." }, { status: 500 });
  }
}
