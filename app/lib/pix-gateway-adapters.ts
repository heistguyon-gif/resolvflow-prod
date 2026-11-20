import { PixGatewayError, type PixProvider, type PixGatewayRef } from "./pix-gateway-config";
import { leztyPixCurrencyIsBRL, readPixProviderJSON, verifyLeztyWebhookSignature } from "./leztypay";
export type PixOrigin = { provider: PixProvider; apiKey: string; webhookSecret: string; ref: PixGatewayRef; namespace: string };
export type PixTransaction = { id: string; status: "pending"|"paid"|"expired"|"failed"|"refunded"|"chargeback"; amountCents: number; currency: "BRL"; reference: string; qrCode: string | null };
const HOSTS = { leztypay: "https://api.leztypay.com/v1", bravopay: "https://bravopay.club/api/v1" };
const safeId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_:-]{1,160}$/.test(value);
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new PixGatewayError("provider_protocol",502); return value as Record<string,unknown>; }
export function normalizePixTransaction(provider: PixProvider, value: unknown): PixTransaction {
  const tx=object(value),metadata=tx.metadata === null || tx.metadata === undefined ? {} : object(tx.metadata);
  const status=typeof tx.status === "string" ? tx.status.toLowerCase() : "";
  const amount=provider === "leztypay" ? tx.amount : tx.amount_cents;
  const method=provider === "leztypay" ? tx.payment_method : tx.method;
  const reference=provider === "leztypay" ? metadata.payment_id : tx.external_reference;
  if (!safeId(tx.id) || !["pending","paid","expired","failed","refunded","chargeback"].includes(status)
    || typeof amount!=="number" || !Number.isSafeInteger(amount) || amount<1 || !(provider==="leztypay"?leztyPixCurrencyIsBRL(tx):tx.currency==="BRL")
    || typeof method!=="string" || method.toLowerCase()!=="pix" || !safeId(reference)
    || provider==="leztypay" && tx.mode!=="live") throw new PixGatewayError("provider_protocol",502);
  const pix=tx.pix ? object(tx.pix) : {};
  const qr=provider==="leztypay" ? pix.payload : pix.copy_paste;
  if(qr!==undefined&&qr!==null&&(typeof qr!=="string"||qr.length>16000))throw new PixGatewayError("provider_protocol",502);
  return {id:tx.id,status:status as PixTransaction["status"],amountCents:amount,currency:"BRL",reference,qrCode:typeof qr==="string"&&qr.trim()?qr:null};
}
export function createPixGatewayAdapters(fetcher: typeof fetch = fetch) {
  async function request(origin: PixOrigin, path: string, init: RequestInit={}) {
    // Host is selected by audited adapter, never by admin/customer input.
    let response: Response;
    try { response=await fetcher(HOSTS[origin.provider]+path,{...init,redirect:"manual",credentials:"omit",signal:AbortSignal.timeout(20000),headers:{authorization:`Bearer ${origin.apiKey}`,accept:"application/json",...(init.body?{"content-type":"application/json"}:{}),...init.headers}}); }
    catch { throw new PixGatewayError("provider_unavailable",502); }
    if(!response.ok){await response.body?.cancel().catch(()=>{});throw new PixGatewayError(response.status>=300&&response.status<400?"provider_redirect":response.status===429?"provider_throttle":"provider_unavailable",502);}
    let value:unknown;try{value=await readPixProviderJSON(response);}catch(error){throw new PixGatewayError(error instanceof Error&&error.message==="provider_protocol"?"provider_protocol":"provider_unavailable",502);}
    return normalizePixTransaction(origin.provider,value);
  }
  return {
    async create(origin: PixOrigin,input:{id:string;amountCents:number;email:string;name:string;document:string}) {
      if(!safeId(input.id)||!Number.isSafeInteger(input.amountCents)||input.amountCents<500||input.amountCents>500000)throw new PixGatewayError("invalid_input",400);
      const metadata={payment_id:input.id};
      const body=origin.provider==="leztypay" ? {
        amount:input.amountCents,currency:"BRL",payment_method:"pix",customer:{name:input.name,email:input.email,document:input.document},
        items:[{name:"Créditos Resolvflow",quantity:1,unit_amount:input.amountCents}],pix:{expires_in_seconds:1800},metadata,
        postback_url:`https://resolvflow.online/api/otp/pix/webhook?configId=${origin.ref.configId}&version=${origin.ref.version}`,
      } : {amount_cents:input.amountCents,method:"pix",customer:{email:input.email,name:input.name,cpf:input.document},description:"Resolvflow créditos",external_reference:input.id,metadata,expires_in:1800};
      return request(origin,"/transactions",{method:"POST",headers:{"Idempotency-Key":`pix.${input.id}`},body:JSON.stringify(body)});
    },
    async lookup(origin: PixOrigin,id:string){
      if(!safeId(id))throw new PixGatewayError("invalid_payment",400);
      const tx=await request(origin,`/transactions/${encodeURIComponent(id)}`);
      if(tx.id!==id)throw new PixGatewayError("payment_identity_mismatch");
      return tx;
    },
    async webhook(origin:PixOrigin,rawBody:string,headers:Headers){
      const header=origin.provider==="leztypay" ? headers.get("x-signature") : headers.get("bravopay-signature")||headers.get("x-bravopay-signature");
      if(!await verifyLeztyWebhookSignature({rawBody,signatureHeader:header||"",secret:origin.webhookSecret}))throw new PixGatewayError("invalid_signature",401);
      let value:unknown;try{value=JSON.parse(rawBody);}catch{throw new PixGatewayError("invalid_event",400);}
      const envelope=object(value);
      if(!safeId(envelope.id)||typeof envelope.type!=="string"||!/^transaction\.(created|paid|expired|failed|refunded|chargeback)$/.test(envelope.type))throw new PixGatewayError("invalid_event",400);
      const transaction=origin.provider==="leztypay"?object(envelope.data).object:envelope.data;
      return {eventId:envelope.id,transaction:normalizePixTransaction(origin.provider,transaction)};
    },
  };
}
