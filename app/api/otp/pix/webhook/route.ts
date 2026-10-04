import { waitUntil } from "cloudflare:workers";
import { getDb } from "../../../../../db";
import { otpPixWebhookEvents } from "../../../../../db/schema";
import { processLeztyWebhookEvent, settleBravoPayNotification } from "../../../../../lib/otp-billing";
import { parseLeztyWebhook, verifyLeztyWebhookSignature } from "../../../../../lib/leztypay";
import { runtimeEnv } from "../../../../../lib/runtime-env";

const MAX_WEBHOOK_BYTES = 256 * 1024;

export async function GET(request: Request) {
  if (!runtimeEnv().LEZTYPAY_WEBHOOK_SECRET?.trim()) {
    const url = new URL(request.url);
    const id = url.searchParams.get("id") || url.searchParams.get("data.id") || "";
    if (id) await settleBravoPayNotification(id);
  }
  return Response.json({ ok: true, provider: "leztypay" });
}

export async function POST(request: Request) {
  const secret = runtimeEnv().LEZTYPAY_WEBHOOK_SECRET?.trim() || "";
  if (!secret) {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : {};
    const id = String(data.id || (String(body.id || "").startsWith("tx_") ? body.id : "") || "").trim();
    const type = String(body.type || "");
    if (id && (!type || type === "transaction.paid" || type.endsWith(".paid"))) await settleBravoPayNotification(id);
    return Response.json({ ok: true });
  }
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (declaredSize > MAX_WEBHOOK_BYTES) return Response.json({ error: "Payload muito grande." }, { status: 413 });
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).length > MAX_WEBHOOK_BYTES) return Response.json({ error: "Payload muito grande." }, { status: 413 });
  const valid = await verifyLeztyWebhookSignature({ rawBody, signatureHeader: request.headers.get("x-signature") || "", secret });
  if (!valid) return Response.json({ error: "Assinatura inválida." }, { status: 401 });

  try {
    const event = parseLeztyWebhook(rawBody);
    if (!event.type.startsWith("transaction.")) return Response.json({ ok: true, ignored: true });
    const transactionId = event.data.object.id;
    const inserted = await getDb().insert(otpPixWebhookEvents).values({
      eventId: event.id,
      eventType: event.type,
      providerPaymentId: transactionId,
      status: "received",
    }).onConflictDoNothing().returning({ eventId: otpPixWebhookEvents.eventId });
    waitUntil(processLeztyWebhookEvent(event.id).catch((error) => {
      console.error(JSON.stringify({ type: "leztypay.webhook.reconcile", eventId: event.id, outcome: "error", error: error instanceof Error ? error.message : "Falha desconhecida." }));
    }));
    return Response.json({ ok: true, duplicate: inserted.length === 0 });
  } catch (error) {
    return Response.json({ error: error instanceof SyntaxError ? "JSON inválido." : "Evento inválido." }, { status: 400 });
  }
}
