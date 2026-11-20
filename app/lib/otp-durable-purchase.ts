/** New purchases only. R2 journals survive requests; existing D1 tables hold money/inbox atomically. */
type Provider = "otpgmail" | "instacaster";
type Order = { order_id: string; email: string; status?: string; price?: string };
type Trace = { provider: Provider; warehouse: 2 | 99; priorityMode?: 0 | 1 | 2; stage: "purchase"; code: "delivered" | "out_of_stock" | "rejected" | "confirmation_pending"; status?: number; at: string };
type Resolution = { actor: string; note: string; at: string; settledAt?: string };
type Item = { status: "pending" | "requesting" | "uncertain" | "delivered" | "failed"; provider: Provider; switched?: boolean; warehouse: 2 | 99; priorityMode?: 0 | 1 | 2; key: string; attempts: number; started?: number; keyHash?: string; order?: Order; error?: string; trace?: Trace[]; resolution?: Resolution; refundSettledAt?:string; refundDecision?:{reason:"unconfirmed_delivery";at:string;settledAt?:string} };
type Journal = { id: string; requestId: string; actor: string; owner: string; quantity: number; unit: number; funded: boolean; items: Item[]; sourceMode?: "automatic" | "supplier_1" | "supplier_2"; createdAt: string; lockUntil: number; token: string | null; cancelledAt?: string; reviewRequestedAt?: string };
export type PurchaseProviders = {
  tryAllPriorities?: boolean;
  key: (provider: Provider) => string;
  buy: (provider: Provider, warehouse: 2 | 99, idempotencyKey: string, priorityMode?: 0 | 1 | 2) => Promise<{ order: Order | null; failure: { status: number; data: unknown } | null }>;
  stockFailure: (status: number, data: unknown) => boolean;
};
export class PurchaseError extends Error { constructor(message: string, public status = 409) { super(message); } }
const prefix = (owner: string, actor: string) => `otp-purchases/v1/${encodeURIComponent(owner)}/${encodeURIComponent(actor)}/`;
// InstaCaster documents this exact refusal as not charged. A generic 502,
// gateway HTML, conflicting envelope or an allocation is not that refusal.
export function isUnchargedServiceFailure(provider: Provider, status: number, data: unknown) {
  if(provider!=="instacaster"||status!==502||!data||typeof data!=="object"||Array.isArray(data))return false;
  const root=data as Record<string,unknown>;
  const envelope=Object.keys(root).length===1&&root.detail&&typeof root.detail==="object"&&!Array.isArray(root.detail)?root.detail as Record<string,unknown>:root;
  if(Object.keys(envelope).length!==1||!envelope.error||typeof envelope.error!=="object"||Array.isArray(envelope.error))return false;
  const error=envelope.error as Record<string,unknown>;
  return Object.keys(error).every(key=>key==="code"||key==="message")&&error.code==="service_error"&&typeof error.message==="string"&&error.message.trim().length>0;
}
function unallocatedStockRefusal(status: number, data: unknown) {
  if(status!==409||!data||typeof data!=="object"||Array.isArray(data))return false;
  const root=data as Record<string,unknown>;
  const envelopes=[root,root.detail].filter((v):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v));
  return envelopes.every(v=>!["order_id","email","order","orders"].some(key=>Object.hasOwn(v,key)));
}
async function hash(text: string) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,"0")).join(""); }

export class DurableOtpPurchases {
  constructor(private db: D1Database, private bucket: R2Bucket, private owner: string, private actor: string, private email = "") {}
  private path(id: string) { if (!/^[a-f0-9]{64}$/.test(id)) throw new PurchaseError("Pedido inválido.",400); return prefix(this.owner,this.actor)+id+".json"; }
  private cancelPath(id: string) { return this.path(id)+".cancel"; }
  private async cancellation(id: string) {
    const object=await this.bucket.get(this.cancelPath(id));
    return object ? (await object.json<{at:string}>()).at : undefined;
  }
  private async applyCancellation(j: Journal) {
    const at=await this.cancellation(j.id);
    if(!at)return false;
    j.cancelledAt??=at;
    for(const item of j.items) {
      if(item.status==="pending"){item.status="failed";item.error="cancelled";}
      else if(item.status==="requesting")item.status="uncertain";
    }
    return true;
  }
  private index(id: string) { return `otp-purchases-active/v1/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.actor)}/${id}`; }
  private async read(id: string) {
    const object=await this.bucket.get(this.path(id));
    if(!object)return null;
    const journal=await object.json<Journal>();
    if(journal.owner!==this.owner||journal.actor!==this.actor||journal.id!==id)throw new PurchaseError("Pedido não encontrado.",404);
    return {journal,etag:object.etag};
  }
  private async write(journal: Journal, etag?: string) {
    const saved=await this.bucket.put(this.path(journal.id),JSON.stringify(journal),{onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"application/json",cacheControl:"no-store"}});
    if(!saved)throw new PurchaseError("Este pedido está sendo atualizado. Aguarde a próxima consulta.");
    return saved.etag;
  }
  // A sentinel is never committed: D1 batch is a transaction and all balances stay >= 0.
  private async money(id: string, amount: number, debit: boolean, summary: string, ref: string) {
    if(!amount)return true;
    const signed=debit?-amount:amount,now=new Date().toISOString();
    await this.db.batch([
      this.db.prepare(`INSERT INTO otp_ledger(id,workspace_owner_user_id,actor_user_id,type,amount_cents,balance_after_cents,ref_id,summary,created_at)
        SELECT ?,workspace_owner_user_id,?,?,?,-1,?,?,? FROM otp_wallets WHERE workspace_owner_user_id=? AND balance_cents+? >= 0
        ON CONFLICT(id) DO NOTHING`).bind(id,this.actor,debit?"debit_order":"refund_order",amount,ref,summary,now,this.owner,signed),
      this.db.prepare(`UPDATE otp_wallets SET balance_cents=balance_cents+?,updated_at=? WHERE workspace_owner_user_id=?
        AND EXISTS(SELECT 1 FROM otp_ledger WHERE id=? AND workspace_owner_user_id=? AND balance_after_cents=-1)`).bind(signed,now,this.owner,id,this.owner),
      this.db.prepare(`UPDATE otp_ledger SET balance_after_cents=(SELECT balance_cents FROM otp_wallets WHERE workspace_owner_user_id=?)
        WHERE id=? AND workspace_owner_user_id=? AND balance_after_cents=-1`).bind(this.owner,id,this.owner),
    ]);
    return Boolean(await this.db.prepare("SELECT id FROM otp_ledger WHERE id=? AND workspace_owner_user_id=? AND balance_after_cents>=0").bind(id,this.owner).first());
  }
  async create(requestId: string, quantity: number, unit: number, chooseProvider:()=>Promise<Provider> = async()=>"otpgmail", sourceMode:Journal["sourceMode"]="automatic") {
    if(!["automatic","supplier_1","supplier_2"].includes(sourceMode))throw new PurchaseError("Origem inválida.",400);
    if(!/^[a-f0-9-]{36}$/i.test(requestId)||!Number.isInteger(quantity)||quantity<1||quantity>13||!Number.isInteger(unit)||unit<0)throw new PurchaseError("Atualize a página antes de solicitar um Gmail.",400);
    const id=await hash(`${this.owner}:${this.actor}:${requestId}`);
    const existing=await this.read(id);
    if(existing){if(existing.journal.quantity!==quantity||existing.journal.unit!==unit||(existing.journal.sourceMode??"automatic")!==sourceMode)throw new PurchaseError("Pedido já registrado com outros valores.");return id;}
    const provider=await chooseProvider();
    const journal: Journal={id,requestId,actor:this.actor,owner:this.owner,quantity,unit,sourceMode,funded:false,createdAt:new Date().toISOString(),lockUntil:0,token:null,items:Array.from({length:quantity},()=>({status:"pending",provider,warehouse:2,key:crypto.randomUUID(),attempts:0}))};
    try{await this.write(journal);}catch(error){const raced=await this.read(id);if(!raced)throw error;if(raced.journal.quantity!==quantity||raced.journal.unit!==unit||(raced.journal.sourceMode??"automatic")!==sourceMode)throw new PurchaseError("Pedido já registrado com outros valores.");}
    return id;
  }
  // Accept the durable identity without waiting for a supplier. Funding and
  // dispatch remain under advance's lease; replay only repairs these indexes.
  async accept(id: string) {
    const snapshot=await this.read(id);
    if(!snapshot)throw new PurchaseError("Pedido n\u00e3o encontrado.",404);
    await this.bucket.put(this.index(id),"1");
    await this.remember(id);
    return this.status(id);
  }
  private async settle(j: Journal) {
    for(let index=0;index<j.items.length;index++) {
      const item=j.items[index],itemId=`purchase-v2:${j.id}:${index}`;
      if(item.refundDecision) {
        await this.db.prepare(`INSERT INTO audit_events(id,owner_user_id,actor_user_id,actor_email,action,entity_type,entity_id,summary,metadata_json)
          VALUES(?,?,'system','','otp.unconfirmed.refund','otp_order',?,'Decisão de devolver reserva sem confirmação de entrega',?) ON CONFLICT(id) DO NOTHING`)
          .bind(`unconfirmed:${itemId}`,this.owner,j.id,JSON.stringify({item:index,reason:item.refundDecision.reason,at:item.refundDecision.at,confirmedNoDelivery:false,amountCents:j.funded?j.unit:0})).run();
      }
      if(item.resolution) {
        // The decision is durable before money moves; replay repairs either failed write.
        await this.db.prepare(`INSERT INTO audit_events(id,owner_user_id,actor_user_id,actor_email,action,entity_type,entity_id,summary,metadata_json)
          VALUES(?,?,?,'','otp.review.refund','otp_order',?,'Ausência de entrega confirmada pelo administrador',?) ON CONFLICT(id) DO NOTHING`)
          .bind(`review:${itemId}`,this.owner,item.resolution.actor,j.id,JSON.stringify({item:index,note:item.resolution.note,confirmedNoDelivery:true,at:item.resolution.at})).run();
      }
      if((item.status==="failed"||item.refundDecision)&&j.funded) {
        if(!await this.money(`refund:${itemId}`,j.unit,false,item.refundDecision?"Entrega sem confirmação · reserva devolvida":"Pedido não entregue · reserva devolvida",itemId))throw new Error("Não foi possível devolver a reserva.");
      }
      if(item.refundDecision)item.refundDecision.settledAt??=new Date().toISOString();
      if(item.status==="failed")item.refundSettledAt??=new Date().toISOString();
      if(item.status==="delivered"&&item.order) {
        const o=item.order;
        // Stable primary key prevents duplicate inbox records after a lost response.
        await this.db.batch([this.db.prepare(`INSERT INTO otp_inbox(id,account_user_id,workspace_owner_user_id,supplier_api_id,order_id,email,product,status,price,created_at,updated_at)
          VALUES(?,?,?,NULL,?,?,'ig_gmail_otp',?,?,?,?) ON CONFLICT(id) DO NOTHING`)
          .bind(itemId,this.actor,this.owner,o.order_id,o.email,o.status||"active",o.price||"",j.createdAt,new Date().toISOString()),
          this.db.prepare(`INSERT INTO audit_events(id,owner_user_id,actor_user_id,actor_email,action,entity_type,entity_id,summary,metadata_json)
            VALUES(?,?,?,?,'otp.order','otp_order',?,?,?) ON CONFLICT(id) DO NOTHING`)
            .bind(itemId,this.owner,this.actor,this.email,o.order_id,"Gmail entregue",JSON.stringify({quantity:1,requested:1,operationId:j.id,chargedCents:j.unit,billed:j.unit?"wallet":"supplier"})),
        ]);
      }
    }
  }
  private view(j: Journal, cancelRequested = false) {
    const delivered=j.items.filter(x=>x.status==="delivered"),failed=j.items.filter(x=>x.status==="failed").length;
    const refunded=j.items.filter(x=>x.status!=="failed"&&x.refundDecision?.settledAt).length;
    const failedSettled=j.items.filter(x=>x.status==="failed"&&(x.refundSettledAt||!j.funded)).length;
    const canRetry=(x:Item)=>!x.refundDecision&&!x.order&&!x.resolution&&(x.status==="pending"||x.status==="uncertain"&&x.provider==="otpgmail"&&x.attempts<3&&x.error!=="credentials_changed"&&Boolean(x.started&&Date.now()-x.started<300000));
    const pending=j.quantity-delivered.length-failedSettled-refunded;
    // Client DTO: supplier diagnostics stay in the journal/reviewItems, including for admins using the client API.
    return {operationId:j.id,requestId:j.requestId,createdAt:j.createdAt,reviewRequestedAt:j.reviewRequestedAt,status:pending?j.lockUntil>Date.now()?"running":"pending":"completed",orders:delivered.map(x=>({order_id:x.order!.order_id,email:x.order!.email,status:["active","pending","ready","closed"].includes(x.order!.status||"")?x.order!.status:"active"})),ordered:delivered.length,requested:j.quantity,failed,pending,charged_cents:delivered.length*j.unit,reserved_cents:j.funded?pending*j.unit:0,refunded_cents:j.funded?(failedSettled+refunded)*j.unit:0,needsReview:false,canContinue:!cancelRequested&&!j.cancelledAt&&j.lockUntil<=Date.now()&&j.items.some(x=>canRetry(x)),cancelRequested:cancelRequested||Boolean(j.cancelledAt),cancelled:Boolean(j.cancelledAt),state:cancelRequested&&pending?"cancelling":!pending&&refunded?"unconfirmed_refunded":j.items.some(x=>x.resolution)?"review_refunded":j.cancelledAt?"cancelled":!pending&&!delivered.length?j.items.every(x=>x.error==="out_of_stock")?"out_of_stock":"unavailable":undefined,billed:j.unit?"wallet":"supplier",partial:delivered.length<j.quantity,
      items:j.items.map(publicItem)};
  }
  private reviewable(j: Journal, item: Item) {
    if(item.refundDecision||item.order)return false;
    return (item.status==="uncertain"||item.status==="requesting"&&j.lockUntil<=Date.now()) &&
      (Boolean(j.cancelledAt)||item.provider!=="otpgmail"||item.attempts>=3||item.error==="credentials_changed"||!item.started||Date.now()-item.started>=23*3600000);
  }
  async reviewItems(id: string) {
    const s=await this.read(id);if(!s)return [];
    const j=s.journal;
    return j.items.flatMap((item,index)=>item.resolution&&!item.resolution.settledAt ? [{
      id:durableReviewId(this.owner,this.actor,id,index),kind:"durable" as const,item_index:index,operation_id:id,account_user_id:j.actor,workspace_owner_user_id:j.owner,
      provider:item.provider,warehouse:item.warehouse,unit_cents:j.funded?j.unit:0,requested_at:j.createdAt,status:item.status,code:safeCode(item.error),
      attempts:item.attempts,trace:item.trace||[],cancelled:Boolean(j.cancelledAt),review_requested:Boolean(j.reviewRequestedAt),settlementPending:Boolean(item.resolution),
    }] : []);
  }
  async requestReview(id: string) {
    const result=await this.reconcile(id,true);
    if(!result)throw new PurchaseError("Pedido não encontrado.",404);
    return result;
  }
  async resolveReview(id: string, index: number, input: {actor:string;note:string;confirmedNoDelivery:boolean}) {
    const note=input.note.trim();
    if(!input.actor||input.confirmedNoDelivery!==true||note.length<10||note.length>1000)throw new PurchaseError("Confirme a ausência de entrega e descreva a conferência (10 a 1.000 caracteres).",400);
    const s=await this.read(id);if(!s)throw new PurchaseError("Pedido não encontrado.",404);
    const j=s.journal,item=j.items[index];
    if(!Number.isInteger(index)||!item)throw new PurchaseError("Item inválido.",400);
    if(j.lockUntil>Date.now())throw new PurchaseError("Este pedido está em andamento. Aguarde antes de conferir.");
    if(!item.resolution&&!this.reviewable(j,item))throw new PurchaseError("Item não está disponível para conferência.");
    j.lockUntil=Date.now()+180000;j.token=crypto.randomUUID();
    let etag=await this.write(j,s.etag);
    const save=async()=>{etag=await this.write(j,etag);};
    try {
      await this.remember(id);
      await this.recoverFunding(j);
      item.resolution??={actor:input.actor,note,at:new Date().toISOString()};
      item.status="failed"; // Keep the original error and all delivery/history evidence.
      await save();await this.settle(j);
      item.resolution.settledAt??=new Date().toISOString();await save();
    }finally{j.lockUntil=0;j.token=null;await save();}
    return this.view(j);
  }
  // A bounded per-account recent list survives reloads; only explicit history requests read it.
  async recent() {
    const object=await this.bucket.get(prefix(this.owner,this.actor)+"recent.json");
    const ids=object?await object.json<string[]>():[];
    const operations=[];
    for(const id of ids.slice(0,10)){const status=await this.status(id);if(status)operations.push(status);}
    return operations;
  }
  private async remember(id: string) {
    const key=prefix(this.owner,this.actor)+"recent.json";
    for(let retry=0;retry<4;retry++){
      const object=await this.bucket.get(key),ids=object?await object.json<string[]>():[];
      const saved=await this.bucket.put(key,JSON.stringify([id,...ids.filter(x=>x!==id)].slice(0,10)),{onlyIf:object?{etagMatches:object.etag}:{etagDoesNotMatch:"*"}});
      if(saved)return;
    }
    throw new PurchaseError("Histórico sendo atualizado. Confira o mesmo pedido antes de repetir.");
  }
  async cancel(id: string) {
    const snapshot=await this.read(id);if(!snapshot)throw new PurchaseError("Pedido não encontrado.",404);
    // Independent first-writer marker: never overwrite a supplier's live journal.
    // A successful response means cancellation was requested, not that an
    // already dispatched purchase was cancelled or refunded.
    await this.bucket.put(this.cancelPath(id),JSON.stringify({at:new Date().toISOString()}),{onlyIf:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"application/json",cacheControl:"no-store"}});
    const latest=await this.read(id);
    if(!latest)throw new PurchaseError("Pedido n\u00e3o encontrado.",404);
    const j=latest.journal;
    if(j.lockUntil>Date.now())return this.view(j,true);
    j.lockUntil=Date.now()+180000;j.token=crypto.randomUUID();
    let etag:string;
    try{etag=await this.write(j,latest.etag);}catch(error){
      if(!(error instanceof PurchaseError))throw error;
      const raced=await this.read(id);
      if(!raced)throw error;
      return this.view(raced.journal,true);
    }
    const save=async()=>{etag=await this.write(j,etag);};
    try {
      await this.remember(id);
      // A crash may have committed the debit before funded=true reached R2.
      await this.recoverFunding(j);
      await this.applyCancellation(j);
      this.decideUnconfirmed(j);
      // Stop future purchases first; uncertainty is retained separately from the refund decision.
      await save();await this.settle(j);
    }finally{j.lockUntil=0;j.token=null;await save();}
    return this.view(j);
  }
  private async recoverFunding(j:Journal) {
    if(j.unit>0)j.funded=Boolean(await this.db.prepare("SELECT id FROM otp_ledger WHERE id=? AND workspace_owner_user_id=? AND actor_user_id=? AND type='debit_order' AND amount_cents=? AND balance_after_cents>=0").bind(`reserve:${j.id}`,this.owner,this.actor,j.quantity*j.unit).first());
  }
  private decideUnconfirmed(j:Journal,force=false) {
    let changed=false;
    for(const item of j.items){
      if(item.refundDecision||item.resolution||item.order||!["uncertain","requesting"].includes(item.status))continue;
      if(force||j.cancelledAt||item.provider==="instacaster"||item.attempts>=3||item.error==="credentials_changed"||!item.started||Date.now()-item.started>=300000){
        item.refundDecision={reason:"unconfirmed_delivery",at:new Date().toISOString()};changed=true;
      }
    }
    return changed;
  }
  private async reconcile(id:string,force=false) {
    const s=await this.read(id);if(!s)return null;
    const j=s.journal;if(j.lockUntil>Date.now())return this.view(j,Boolean(await this.cancellation(id)));
    j.token=crypto.randomUUID();j.lockUntil=Date.now()+180000;
    let etag:string;
    try{etag=await this.write(j,s.etag);}catch(error){
      if(error instanceof PurchaseError){const latest=await this.read(id);return latest?this.view(latest.journal,Boolean(await this.cancellation(id))):null;}throw error;
    }
    const save=async()=>{etag=await this.write(j,etag);};
    try{
      await this.recoverFunding(j);
      await this.applyCancellation(j);
      // A dead worker's requesting snapshot is eligible for the same idempotent OTP replay.
      for(const item of j.items)if(item.status==="requesting"&&!item.refundDecision&&!item.order)item.status="uncertain";
      const decided=this.decideUnconfirmed(j,force);
      if(decided||j.items.some(item=>item.refundDecision&&!item.refundDecision.settledAt)){
        await this.bucket.put(this.index(id),"1");await this.remember(id);
      }
      await save(); // Persist the terminal decision before audit or money; leases never call suppliers.
      await this.settle(j);await save();
    }finally{j.lockUntil=0;j.token=null;await save();}
    const result=this.view(j);if(!result.pending)await this.bucket.delete(this.index(id));return result;
  }
  async status(id: string) {return this.reconcile(id);}
  async pending() {
    const operations=[];let cursor: string|undefined;
    do {
      const page=await this.bucket.list({prefix:this.index(""),limit:100,cursor});
      for(const object of page.objects){const id=object.key.split("/").at(-1)!;const status=await this.status(id);if(status?.pending)operations.push(status);}
      cursor=page.truncated?page.cursor:undefined;
    }while(cursor);
    return operations;
  }
  async advanceFallbacks(id: string, providers: PurchaseProviders, deadline = Date.now() + 75000) {
    const before = await this.status(id);
    if (!before) throw new PurchaseError("Pedido não encontrado.",404);
    let result = before;
    // Only continue definitive refusals for the same pending item. Delivery,
    // uncertainty, concurrent work, cancellation or a spent budget stop here.
    for (let step = 0; step < 5 && Date.now()+15000 < deadline && result.canContinue && result.status !== "running"; step++) {
      const pending = result.items.find(item => item.result === "processing");
      result = await this.advance(id, providers);
      if (!pending || result.ordered !== before.ordered || result.failed !== before.failed) break;
      const current = result.items.find(item => item.index === pending.index);
      if (current?.result !== "processing" || current.steps.length <= pending.steps.length) break;
    }
    return result;
  }
  async advance(id: string, providers: PurchaseProviders) {
    const status=await this.status(id);if(!status)throw new PurchaseError("Pedido não encontrado.",404);
    if(status.status==="running"||!status.canContinue)return status;
    const snapshot=await this.read(id);if(!snapshot)throw new PurchaseError("Pedido não encontrado.",404);
    const j=snapshot.journal;
    if(j.cancelledAt||j.items.every(x=>x.status==="delivered"||x.status==="failed"||x.refundDecision))return this.view(j);
    if(j.lockUntil>Date.now())return this.view(j);
    j.token=crypto.randomUUID();j.lockUntil=Date.now()+180000;
    let etag=await this.write(j,snapshot.etag);
    const save=async()=>{etag=await this.write(j,etag);};
    try {
      await this.bucket.put(this.index(id),"1");
      await this.remember(id);
      if(await this.applyCancellation(j)){await this.recoverFunding(j);this.decideUnconfirmed(j);await save();await this.settle(j);return this.view(j);}
      if(!j.funded) {
        j.funded=await this.money(`reserve:${j.id}`,j.quantity*j.unit,true,`Reserva de ${j.quantity} Gmail(s)`,j.id);
        if(!j.funded){j.items.forEach(x=>{x.status="failed";x.error="insufficient_balance";});await save();throw new PurchaseError("Saldo insuficiente para este lote.",402);}
        await save();
      }
      await this.settle(j);
      const item=j.items.find(x=>!x.refundDecision&&!x.order&&!x.resolution&&(x.status==="pending"||x.status==="requesting"||x.status==="uncertain"&&x.provider==="otpgmail"&&x.attempts<3&&x.error!=="credentials_changed"&&x.started&&Date.now()-x.started<300000));
      if(!item)return this.view(j);
      const wasUncertain=item.status==="uncertain"||item.status==="requesting";
      if(item.status==="requesting")item.status="uncertain";
      if(item.status==="uncertain"&&(item.provider!=="otpgmail"||item.attempts>=3||!item.started||Date.now()-item.started>=23*3600000)){await save();return this.view(j);}
      const trace=(code:Trace["code"],status?:number)=>{item.trace=[...(item.trace||[]),{provider:item.provider,warehouse:item.warehouse,...(item.provider==="instacaster"?{priorityMode:item.priorityMode??0}:{}),stage:"purchase" as const,code,...(status?{status}:{}),at:new Date().toISOString()}].slice(-40);};
      const key=providers.key(item.provider),keyHash=await hash(`${item.provider}:${key}`);
      const nextProvider=(reason="unavailable")=>{if(j.sourceMode&&j.sourceMode!=="automatic"){item.status="failed";item.error=reason;return;}item.provider=item.provider==="otpgmail"?"instacaster":"otpgmail";item.switched=true;item.status="pending";item.key=crypto.randomUUID();item.attempts=0;delete item.priorityMode;delete item.started;delete item.keyHash;delete item.error;};
      if(!key){if(item.status==="uncertain"){item.error="credentials_changed";}else{trace("rejected");if(!item.switched)nextProvider();else{item.status="failed";item.error="unavailable";}}this.decideUnconfirmed(j);await save();await this.settle(j);await save();return this.view(j);}
      if(item.status==="uncertain"&&item.keyHash!==keyHash){item.error="credentials_changed";this.decideUnconfirmed(j);await save();await this.settle(j);await save();return this.view(j);}
      item.status="requesting";item.keyHash=keyHash;item.started??=Date.now();item.attempts++;j.lockUntil=Date.now()+180000;
      await save(); // Crash after this point is uncertain, never a fresh paid request.
      // Cancellation accepted before dispatch must never start a paid request.
      if(await this.cancellation(id)){item.status=wasUncertain?"uncertain":"pending";await this.applyCancellation(j);this.decideUnconfirmed(j);await save();await this.settle(j);return this.view(j);}
      try {
        const result=await providers.buy(item.provider,item.warehouse,item.key,item.priorityMode??0);
        if(result.order&&/^[A-Za-z0-9_-]{6,64}$/.test(result.order.order_id)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.order.email)) {
          trace("delivered");
          item.order=result.order;item.status="delivered";
        }else{
          const f=result.failure,stock=Boolean(f&&providers.stockFailure(f.status,f.data)&&(!providers.tryAllPriorities||item.provider!=="instacaster"||unallocatedStockRefusal(f.status,f.data)));
          const rejected=Boolean(f&&([400,401,402,403,404,422,429].includes(f.status)||isUnchargedServiceFailure(item.provider,f.status,f.data)));
          trace(stock?"out_of_stock":rejected?"rejected":"confirmation_pending",f?.status);
          if(wasUncertain){
            item.status="uncertain";item.error=f?.status===401||f?.status===403?"credentials_changed":"confirmation_pending";
          }else if(stock||rejected) {
            if(item.provider==="otpgmail"&&stock&&item.warehouse===2){item.warehouse=99;item.status="pending";item.key=crypto.randomUUID();item.attempts=0;delete item.started;delete item.keyHash;}
            else if(providers.tryAllPriorities&&item.provider==="instacaster"&&stock&&(item.priorityMode??0)<2){item.priorityMode=((item.priorityMode??0)+1) as 1|2;item.status="pending";item.key=crypto.randomUUID();item.attempts=0;delete item.started;delete item.keyHash;delete item.error;}
            else if(!item.switched)nextProvider(stock?"out_of_stock":"unavailable");
            else{item.status="failed";item.error=stock&&!item.trace?.some(step=>step.code==="rejected")?"out_of_stock":"unavailable";}
          }
          else{item.status="uncertain";item.error="confirmation_pending";}
        }
      }catch{trace("confirmation_pending");item.status="uncertain";item.error="confirmation_pending";}
      await this.applyCancellation(j);
      this.decideUnconfirmed(j);await save();await this.settle(j);await save();
    }finally{j.lockUntil=0;j.token=null;await save();}
    return this.view(j);
  }
}

function safeCode(code?:string) {return ["out_of_stock","unavailable","confirmation_pending","credentials_changed","cancelled","insufficient_balance"].includes(code||"")?code:undefined;}
type PublicResult="processing"|"awaiting_confirmation"|"delivered"|"out_of_stock"|"unavailable"|"cancelled"|"review_completed"|"insufficient_balance"|"unconfirmed_refunded";
function publicItem(item:Item,index:number) {
  const result:PublicResult=item.refundDecision?.settledAt?"unconfirmed_refunded":item.resolution?"review_completed":item.status==="delivered"?"delivered":item.status==="pending"?"processing":item.status!=="failed"?"awaiting_confirmation":item.error==="out_of_stock"?"out_of_stock":item.error==="cancelled"?"cancelled":item.error==="insufficient_balance"?"insufficient_balance":"unavailable";
  const steps=(item.trace||[]).slice(-40).flatMap(step=>{
    const result:PublicResult|undefined=step.code==="delivered"?"delivered":step.code==="out_of_stock"?"out_of_stock":step.code==="rejected"?"unavailable":step.code==="confirmation_pending"?"awaiting_confirmation":undefined;
    return result?[{result}]:[];
  });
  return {index,result,steps};
}
export function durableReviewId(owner:string,actor:string,id:string,index:number) {return ["durable",encodeURIComponent(owner),encodeURIComponent(actor),id,index].join("|");}
