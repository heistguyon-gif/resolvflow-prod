import { getDb } from "../../../../../../db";
import { otpPixWebhookEvents } from "../../../../../../db/schema";
import { processBlackfyWebhookEvent } from "../../../../../../lib/otp-billing";
import { parseBlackfyWebhook, verifyBlackfyWebhookSignature } from "../../../../../../lib/blackfy";
import { runtimeEnv } from "../../../../../../lib/runtime-env";
import { BodyLimitError, readLimitedBody } from "../../../../../../lib/request-body";

const MAX_WEBHOOK_BYTES = 256 * 1024;
const noStore = { "cache-control": "no-store" };

export async function GET() {
  // Health only. Never move money from an unsigned GET notification.
  return Response.json({ ok: true, provider: "blackfy" }, { headers: noStore });
}

export async function POST(request: Request) {
  const secret = runtimeEnv().BLACKFY_WEBHOOK_SECRET?.trim() || "";
  const apiKey = runtimeEnv().BLACKFY_API_KEY?.trim() || "";
  // Fail closed, always: a missing/blank webhook secret (or API key, needed to
  // re-read the charge before crediting) rejects every POST before the body is
  // read. There is no code path that accepts an unsigned or unverified event.
  if (!secret || !apiKey) {
    console.warn(JSON.stringify({ type: "blackfy.webhook.rejected", reason: !secret ? "webhook_secret_missing" : "api_key_missing" }));
    return Response.json({ error: "PIX não configurado." }, { status: 503, headers: noStore });
  }
  let rawBody: string;
  try {
    rawBody = new TextDecoder().decode(await readLimitedBody(request, MAX_WEBHOOK_BYTES));
  } catch (error) {
    return Response.json({ error: error instanceof BodyLimitError ? "Payload muito grande." : "Evento inválido." }, { status: error instanceof BodyLimitError ? 413 : 400, headers: noStore });
  }
  // HMAC-SHA256 over `${t}.${body}`, header BlackPay-Signature: t=…,v1=…, 5-minute window.
  const valid = await verifyBlackfyWebhookSignature({ rawBody, signatureHeader: request.headers.get("blackpay-signature") || "", secret });
  if (!valid) return Response.json({ error: "Assinatura inválida." }, { status: 401, headers: noStore });

  let event;
  try { event = parseBlackfyWebhook(rawBody); } catch (error) {
    return Response.json({ error: error instanceof SyntaxError ? "JSON inválido." : "Evento inválido." }, { status: 400, headers: noStore });
  }
  if (!event.type.startsWith("charge.")) return Response.json({ ok: true, ignored: true }, { headers: noStore });
  const chargeId = String(event.data.object.id || "").trim();
  if (!/^ch_[A-Za-z0-9_-]+$/.test(chargeId) || !/^[A-Za-z0-9_:-]{1,160}$/.test(event.id)) return Response.json({ error: "Evento inválido." }, { status: 400, headers: noStore });
  // Prefixed so BlackFy event ids never collide with Lezty/managed ids in the shared table.
  const eventId = `blackfy:${event.id}`;
  const inserted = await getDb().insert(otpPixWebhookEvents).values({
    eventId,
    eventType: event.type.slice(0, 80),
    providerPaymentId: chargeId,
    status: "received",
  }).onConflictDoNothing().returning({ eventId: otpPixWebhookEvents.eventId });
  try {
    // Synchronous: a failure returns 503 so BlackFy retries. Credit happens only
    // after the charge is re-read with the API key (see processBlackfyWebhookEvent).
    const result = await processBlackfyWebhookEvent(eventId);
    return Response.json({ ok: true, duplicate: inserted.length === 0, reason: result.reason }, { headers: noStore });
  } catch (error) {
    console.error(JSON.stringify({ type: "blackfy.webhook.reconcile", eventId, outcome: "error", error: error instanceof Error ? error.message : "unknown" }));
    return Response.json({ ok: false, retryable: true }, { status: 503, headers: noStore });
  }
}
