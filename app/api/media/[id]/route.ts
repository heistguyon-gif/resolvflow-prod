import { authErrorResponse, requireOwnerId } from "../../../../lib/auth";
import { getMediaBucket, mediaObjectKey } from "../../../../lib/media-storage";

function objectHeaders(object: R2Object) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return headers;
}

function requestedRange(request: Request, size: number) {
  const value = request.headers.get("range");
  const match = value?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : size - 1;
  if (!match[1] && match[2]) { const suffix = Number(match[2]); start = Math.max(0, size - suffix); end = size - 1; }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) return "invalid" as const;
  end = Math.min(end, size - 1);
  return { offset: start, length: end - start + 1, end };
}

async function serve(request: Request, id: string, headOnly = false) {
  let key: string;
  try { key = mediaObjectKey(id); } catch { return new Response("Mídia não encontrada.", { status: 404 }); }
  const bucket = getMediaBucket();
  const metadata = await bucket.head(key);
  if (!metadata) return new Response("Mídia não encontrada.", { status: 404 });
  const range = requestedRange(request, metadata.size);
  if (range === "invalid") return new Response(null, { status: 416, headers: { "content-range": `bytes */${metadata.size}` } });
  if (headOnly) {
    const headers = objectHeaders(metadata); headers.set("content-length", String(metadata.size));
    return new Response(null, { status: 200, headers });
  }
  const object = await bucket.get(key, range ? { range: { offset: range.offset, length: range.length } } : undefined);
  if (!object) return new Response("Mídia não encontrada.", { status: 404 });
  const headers = objectHeaders(object);
  if (range) {
    headers.set("content-length", String(range.length));
    headers.set("content-range", `bytes ${range.offset}-${range.end}/${metadata.size}`);
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("content-length", String(metadata.size));
  return new Response(object.body, { status: 200, headers });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; return serve(request, id);
}

export async function HEAD(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; return serve(request, id, true);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerUserId = await requireOwnerId(request, request.method === "GET" ? "viewer" : "editor"); const { id } = await context.params;
    const key = mediaObjectKey(id); const bucket = getMediaBucket(); const object = await bucket.head(key);
    if (!object) return new Response(null, { status: 204 });
    if (object.customMetadata?.ownerUserId !== ownerUserId) return Response.json({ error: "Mídia não encontrada." }, { status: 404 });
    await bucket.delete(key); return new Response(null, { status: 204 });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível remover a mídia." }, { status: 500 });
  }
}
