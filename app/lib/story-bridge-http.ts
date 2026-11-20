import { BridgeError, fail } from "./story-bridge";

export function noStore(response: Response) {
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("x-content-type-options", "nosniff");
  return response;
}
export function bridgeError(error: unknown) {
  return noStore(Response.json(error instanceof BridgeError ? { error: error.message, code: error.code } : { error: "A ponte está indisponível. Tente novamente em instantes.", code: "unavailable" }, { status: error instanceof BridgeError ? error.status : 503 }));
}
export function sameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") fail("csrf", "Origem da solicitação inválida.", 403);
}
export async function boundedBody(request: Request, max: number) {
  if (Number(request.headers.get("content-length")) > max) fail("body_size", "Solicitação muito grande.", 413);
  const reader = request.body?.getReader();
  if (!reader) fail();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); fail("body_size", "Solicitação muito grande.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
export async function jsonBody(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") fail("content_type", "Envie JSON.", 415);
  const bytes = await boundedBody(request, 16_384);
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return fail(); }
}
export function packageOrigin(request: Request) {
  const url = new URL(request.url);
  const production = url.protocol === "https:" && ["resolvflow.online", "top.resolvflow.online"].includes(url.hostname) && !url.port;
  const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (!production && !local) fail("origin", "Origem não autorizada para gerar a extensão.", 403);
  return url.origin;
}
