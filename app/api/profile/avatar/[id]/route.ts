import { getMediaBucket, profileAvatarKey } from "../../../../../lib/media-storage";

function objectHeaders(object: R2Object) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return headers;
}

async function serve(id: string, headOnly = false) {
  let key: string;
  try { key = profileAvatarKey(id); } catch { return new Response("Foto não encontrada.", { status: 404 }); }
  const bucket = getMediaBucket();
  if (headOnly) {
    const metadata = await bucket.head(key);
    if (!metadata) return new Response("Foto não encontrada.", { status: 404 });
    const headers = objectHeaders(metadata);
    headers.set("content-length", String(metadata.size));
    return new Response(null, { status: 200, headers });
  }
  const object = await bucket.get(key);
  if (!object) return new Response("Foto não encontrada.", { status: 404 });
  const headers = objectHeaders(object);
  headers.set("content-length", String(object.size));
  return new Response(object.body, { status: 200, headers });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return serve(id);
}

export async function HEAD(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return serve(id, true);
}
