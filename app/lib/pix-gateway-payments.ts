import { PixGatewayError, parsePixGatewayNamespace, type createPixGatewayRegistry } from "./pix-gateway-config";
import { type createPixGatewayAdapters, type PixTransaction } from "./pix-gateway-adapters";
import { settleOtpPayment } from "./otp-wallet-transactions";
type Registry = ReturnType<typeof createPixGatewayRegistry>;
type Adapters = ReturnType<typeof createPixGatewayAdapters>;
type Payment = { id:string;workspace_owner_user_id:string;actor_user_id:string;provider:string;provider_payment_id:string|null;amount_cents:number;status:string;qr_code:string|null;ticket_url:string|null };
type Intent = { id:string;namespace:string;owner:string;actor:string;amount:number;hash:string;state:"accepted"|"sending"|"confirmed"|"uncertain" };
type Codec = {encrypt(text:string):Promise<{ciphertext:string;iv:string}>;decrypt(ciphertext:string,iv:string):Promise<string>};
const hash = async(value:string)=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,"0")).join("");
export function createPixGatewayPayments(db:D1Database,bucket:R2Bucket,codec:Codec,registry:Registry,adapters:Adapters) {
  const readPayment=(id:string)=>db.prepare("SELECT * FROM otp_payments WHERE id=?").bind(id).first<Payment>();
  const path=(id:string)=>`pix-gateways/v1/intents/${id}.json`;
  async function writeIntent(value:Intent,etag?:string){const packed=await codec.encrypt(JSON.stringify(value));return bucket.put(path(value.id),JSON.stringify(packed),{onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"application/json",cacheControl:"no-store"}});}
  async function readIntent(id:string){const object=await bucket.get(path(id));if(!object)return null;const packed=await object.json<{ciphertext:string;iv:string}>();return {value:JSON.parse(await codec.decrypt(packed.ciphertext,packed.iv)) as Intent,etag:object.etag};}
  function dto(p:Payment){return{id:p.id,status:p.status,amountCents:p.amount_cents,qrCode:p.qr_code,ticketUrl:p.ticket_url||"",priceLabel:(p.amount_cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})};}
  async function reconcile(p:Payment,tx:PixTransaction){
    if(tx.reference!==p.id||tx.amountCents!==p.amount_cents||tx.currency!=="BRL"||p.provider_payment_id&&p.provider_payment_id!==tx.id)throw new PixGatewayError("payment_identity_mismatch");
    await db.prepare("UPDATE otp_payments SET provider_payment_id=?,qr_code=coalesce(?,qr_code),status=CASE WHEN status='creating' THEN 'pending' ELSE status END WHERE id=? AND provider=? AND (provider_payment_id IS NULL OR provider_payment_id=?)")
      .bind(tx.id,tx.qrCode,p.id,p.provider,tx.id).run();
    const current=await readPayment(p.id);if(!current||current.provider_payment_id!==tx.id)throw new PixGatewayError("payment_identity_mismatch");
    if(tx.status==="paid"){
      await settleOtpPayment(db,p.id,"PIX confirmado",{verifiedCanonicalPaid:true});
    }
    else if(tx.status!=="pending")await db.prepare("UPDATE otp_payments SET status=? WHERE id=? AND provider=? AND status!='paid'").bind(tx.status,p.id,p.provider).run();
    return dto((await readPayment(p.id))!);
  }
  async function create(input:{requestId?:string;workspaceOwnerUserId:string;actorUserId:string;email:string;name?:string;customerDocument:string;amountCents:number}, existingOnly: boolean){
      if (!/^[a-f0-9-]{36}$/i.test(input.requestId || "")) {
        if (existingOnly) return null;
        throw new PixGatewayError("request_id_required",400);
      }
      const id=await hash(`${input.workspaceOwnerUserId}:${input.actorUserId}:${input.requestId}`);
      let journal=await readIntent(id);
      if (!journal && existingOnly) return null;
      if(!Number.isSafeInteger(input.amountCents)||input.amountCents<500||input.amountCents>500000)throw new PixGatewayError("invalid_amount",400);
      const document=input.customerDocument.replace(/\D/g,"");if(![11,14].includes(document.length))throw new PixGatewayError("invalid_document",400);
      const fingerprint=await hash(JSON.stringify([input.amountCents,input.email,document]));
      if(!journal){
        const origin=await registry.active();if(!origin||origin.legacy)throw new PixGatewayError("gateway_unavailable",503);
        await writeIntent({id,namespace:origin.namespace,owner:input.workspaceOwnerUserId,actor:input.actorUserId,amount:input.amountCents,hash:fingerprint,state:"accepted"});
        journal=await readIntent(id);
      }
      if(!journal||journal.value.owner!==input.workspaceOwnerUserId||journal.value.actor!==input.actorUserId||journal.value.hash!==fingerprint)throw new PixGatewayError("request_conflict");
      const intent=journal.value;
      const ref=parsePixGatewayNamespace(intent.namespace);if(!ref)throw new PixGatewayError("invalid_origin");
      // Durable pin exists BEFORE supplier effect. A switch never changes it.
      await db.prepare("INSERT INTO otp_payments(id,workspace_owner_user_id,actor_user_id,provider,amount_cents,status) VALUES(?,?,?,?,?,'creating') ON CONFLICT(id) DO NOTHING").bind(id,intent.owner,intent.actor,intent.namespace,intent.amount).run();
      const p=await readPayment(id);if(!p||p.provider!==intent.namespace||p.workspace_owner_user_id!==intent.owner||p.actor_user_id!==intent.actor||p.amount_cents!==intent.amount)throw new PixGatewayError("payment_identity_mismatch");
      if(intent.state!=="accepted")return dto(p); // Never repeat an uncertain paid POST, even after worker death.
      const claim=await writeIntent({...intent,state:"sending"},journal.etag);if(!claim)return dto(p);
      const origin=await registry.resolve(ref);
      try{
        const tx=await adapters.create(origin,{id,amountCents:intent.amount,email:input.email,name:(input.name||input.email.split("@")[0]).slice(0,120),document});
        const result=await reconcile(p,tx);
        await writeIntent({...intent,state:"confirmed"},claim.etag);
        return result;
      }catch{
        await writeIntent({...intent,state:"uncertain"},claim.etag);
        // Do not claim rejection/no effect or credit; late signed webhook repairs the same receipt.
        return dto((await readPayment(id))!);
      }
  }
  return {
    create: (input: Parameters<typeof create>[0]) => create(input, false),
    resume: (input: Parameters<typeof create>[0]) => create(input, true),
    async refresh(id:string,owner:string){
      const p=await readPayment(id);if(!p||p.workspace_owner_user_id!==owner)throw new PixGatewayError("payment_not_found",404);
      const ref=parsePixGatewayNamespace(p.provider);if(!ref)throw new PixGatewayError("invalid_origin");
      if(p.status==="paid"||!p.provider_payment_id)return dto(p);
      return reconcile(p,await adapters.lookup(await registry.resolve(ref),p.provider_payment_id));
    },
    async webhook(ref:{configId:string;version:number},raw:string,headers:Headers){
      const origin=await registry.resolve(ref),event=await adapters.webhook(origin,raw,headers);
      const p=await readPayment(event.transaction.reference);
      if(!p||p.provider!==origin.namespace||p.amount_cents!==event.transaction.amountCents)throw new PixGatewayError("payment_not_found",404);
      // A provider ID/event collision in a different configuration can never select a legacy row.
      const eventId=`pixevt:${await hash(JSON.stringify([origin.namespace,event.eventId]))}`;
      const previous=await db.prepare("SELECT status FROM otp_pix_webhook_events WHERE event_id=?").bind(eventId).first<{status:string}>();
      if(previous?.status==="processed")return{ok:true,duplicate:true};
      await db.prepare("INSERT INTO otp_pix_webhook_events(event_id,event_type,provider_payment_id,status) VALUES(?,'managed.transaction',?,'received') ON CONFLICT(event_id) DO NOTHING").bind(eventId,event.transaction.id).run();
      // Lookup by pinned account authenticates canonical status/amount/reference, not just incoming event claims.
      const canonical=await adapters.lookup(origin,event.transaction.id);
      if(canonical.id!==event.transaction.id)throw new PixGatewayError("payment_identity_mismatch");
      await reconcile(p,canonical);
      await db.prepare("UPDATE otp_pix_webhook_events SET status='processed',processed_at=CURRENT_TIMESTAMP,last_error=NULL WHERE event_id=?").bind(eventId).run();
      return{ok:true,duplicate:false};
    },
  };
}
