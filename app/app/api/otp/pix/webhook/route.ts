import { getDb } from "../../../../../db";
import { otpPixWebhookEvents } from "../../../../../db/schema";
import { processLeztyWebhookEvent, settleBravoPayNotification } from "../../../../../lib/otp-billing";
import { parseLeztyWebhook, verifyLeztyWebhookSignature } from "../../../../../lib/leztypay";
import { runtimeEnv } from "../../../../../lib/runtime-env";
import { pixGatewayRuntime } from "../../../../../lib/pix-gateway-runtime";
import { parsePixGatewayNamespace, PixGatewayError } from "../../../../../lib/pix-gateway-config";
import { BodyLimitError, readLimitedBody } from "../../../../../lib/request-body";

const MAX_WEBHOOK_BYTES = 256 * 1024;

export async function GET(request: Request) {
  if(new URL(request.url).searchParams.has("configId"))return Response.json({error:"Use POST assinado."},{status:405});
  // Health only. Never move money from an unsigned GET notification.
  return Response.json({ ok: true, provider: "leztypay" });
}

export async function POST(request: Request) {
  try{return await processPost(request);}catch(error){
    return Response.json({error:"Evento Pix não confirmado.",code:error instanceof BodyLimitError?"body_limit":error instanceof PixGatewayError?error.code:"unavailable"},{status:error instanceof BodyLimitError?413:error instanceof PixGatewayError?error.status:503,headers:{"cache-control":"no-store"}});
  }
}
async function processPost(request:Request){
  const params=new URL(request.url).searchParams;
  if(params.has("configId")||params.has("version")){
      if([...params.keys()].some(key=>!["configId","version"].includes(key))||params.getAll("configId").length!==1||params.getAll("version").length!==1)throw new PixGatewayError("invalid_origin",400);
      const ref=parsePixGatewayNamespace(`pixcfg:${params.get("configId")}:${params.get("version")}`);if(!ref)throw new PixGatewayError("invalid_origin",400);
      const bytes=await readLimitedBody(request,MAX_WEBHOOK_BYTES);
      return Response.json(await pixGatewayRuntime().payments.webhook(ref,new TextDecoder().decode(bytes),request.headers),{headers:{"cache-control":"no-store"}});
  }
  const secret = runtimeEnv().LEZTYPAY_WEBHOOK_SECRET?.trim() || "";
  if (request.headers.has("bravopay-signature")||request.headers.has("x-bravopay-signature")||!secret) {
    const bravoSecret=(runtimeEnv() as unknown as {BRAVOPAY_WEBHOOK_SECRET?:string}).BRAVOPAY_WEBHOOK_SECRET?.trim()||"";
    const raw=new TextDecoder().decode(await readLimitedBody(request,MAX_WEBHOOK_BYTES));
    if(!await verifyLeztyWebhookSignature({rawBody:raw,signatureHeader:request.headers.get("bravopay-signature")||request.headers.get("x-bravopay-signature")||"",secret:bravoSecret}))return Response.json({error:"Assinatura inválida."},{status:401});
    let body:Record<string,unknown>;try{body=JSON.parse(raw);}catch{return Response.json({error:"Evento inválido."},{status:400});}
    const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : {};
    const id = String(data.id || (String(body.id || "").startsWith("tx_") ? body.id : "") || "").trim();
    const type = String(body.type || "");
    if (id && (!type || type === "transaction.paid" || type.endsWith(".paid"))) await settleBravoPayNotification(id);
    return Response.json({ ok: true });
  }
  const rawBody = new TextDecoder().decode(await readLimitedBody(request,MAX_WEBHOOK_BYTES));
  const valid = await verifyLeztyWebhookSignature({ rawBody, signatureHeader: request.headers.get("x-signature") || "", secret });
  if (!valid) return Response.json({ error: "Assinatura inválida." }, { status: 401 });

  let event;
  try { event = parseLeztyWebhook(rawBody); } catch (error) {
    return Response.json({ error: error instanceof SyntaxError ? "JSON inválido." : "Evento inválido." }, { status: 400 });
  }
  if (event.mode !== "live") return Response.json({ ok: true, ignored: true });
  if (event.id.startsWith("pixevt:")) return Response.json({ error:"Evento inválido." }, { status:400 });
  if (!event.type.startsWith("transaction.")) return Response.json({ ok: true, ignored: true });
  const transactionId = event.data.object.id;
  const inserted = await getDb().insert(otpPixWebhookEvents).values({
    eventId: event.id,
    eventType: event.type,
    providerPaymentId: transactionId,
    status: "received",
  }).onConflictDoNothing().returning({ eventId: otpPixWebhookEvents.eventId });
  const result = await processLeztyWebhookEvent(event.id, transactionId);
  if (result.reason === "awaiting_payment_link") return Response.json({ ok: false, retryable: true }, { status: 503, headers: { "cache-control": "no-store" } });
  return Response.json({ ok: true, duplicate: inserted.length === 0 });
}
