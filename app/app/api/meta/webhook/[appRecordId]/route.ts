import { metaWebhookRecordId, verifyMetaWebhookSignature, verifyTokensMatch } from "../../../../../lib/meta-app-registry";
import { BodyLimitError, readLimitedBody } from "../../../../../lib/request-body";
import { webhookCredentials } from "../../../../../lib/user-meta-apps";

const noStore = { "cache-control": "no-store" };
const MAX_BYTES = 256 * 1024;

// Meta webhook endpoint per user-registered app: /api/meta/webhook/<meta_apps.id>.
// GET answers Meta's subscription check; POST accepts only events signed with that
// app's secret (X-Hub-Signature-256). Events are acknowledged, not processed yet.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = metaWebhookRecordId(url.pathname);
  if (!id) return new Response("not found", { status: 404, headers: noStore });
  const credentials = await webhookCredentials(id);
  if (!credentials) return new Response("not found", { status: 404, headers: noStore });
  const challenge = url.searchParams.get("hub.challenge") || "";
  if (url.searchParams.get("hub.mode") !== "subscribe" || !verifyTokensMatch(credentials.verifyToken, url.searchParams.get("hub.verify_token")) || !/^[A-Za-z0-9_-]{1,200}$/.test(challenge)) {
    return new Response("forbidden", { status: 403, headers: noStore });
  }
  return new Response(challenge, { status: 200, headers: { ...noStore, "content-type": "text/plain; charset=utf-8" } });
}

export async function POST(request: Request) {
  const id = metaWebhookRecordId(new URL(request.url).pathname);
  if (!id) return Response.json({ error: "not_found" }, { status: 404, headers: noStore });
  const credentials = await webhookCredentials(id);
  if (!credentials) return Response.json({ error: "not_found" }, { status: 404, headers: noStore });
  let raw: string;
  try { raw = new TextDecoder().decode(await readLimitedBody(request, MAX_BYTES)); } catch (error) {
    return Response.json({ error: error instanceof BodyLimitError ? "too_large" : "invalid" }, { status: error instanceof BodyLimitError ? 413 : 400, headers: noStore });
  }
  if (!await verifyMetaWebhookSignature(credentials.appSecret, raw, request.headers.get("x-hub-signature-256"))) {
    return Response.json({ error: "invalid_signature" }, { status: 401, headers: noStore });
  }
  console.log(JSON.stringify({ type: "meta.webhook.received", app: id, bytes: raw.length }));
  return Response.json({ received: true }, { headers: noStore });
}
