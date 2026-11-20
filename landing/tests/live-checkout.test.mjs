import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { runInNewContext } from 'node:vm';
import { resolve, dirname } from 'node:path';
const load=(path,cache=new Map())=>{
 path=resolve(path);if(cache.has(path))return cache.get(path);
 const exports={};cache.set(path,exports);
 const js=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(js,{exports,require:name=>load(resolve(dirname(path),name)+'.ts',cache),Request,Response,Headers,URL,TextEncoder,TextDecoder,crypto,AbortSignal,Uint8Array,fetch(){throw Error('No real provider');}});
 return exports;
};
const { createCheckout } = load('server/worker.ts');
const { createPilotService } = load('server/pilot-service.ts');
const { FIXED_PLANS,CATALOG_VERSION,TERMS_VERSION,PILOT_ACK_VERSION,PILOT_EMAIL } = load('src/checkout/catalog.ts');
const host='https://resolvflow-landing-variants-20261118.lucasbgn-affiliate.workers.dev';
const root='/api/checkout', t=Date.UTC(2026,10,18);
const webhookSecret='fixture-only-webhook';
function fixture(privatePilot=false) {
 let calls=0, reads=0, lose=false,currentStatus='pending',override={},transaction;
 const map=new Map();
 const bucket={
  async get(key){const v=map.get(key);return v&&{etag:v.etag,json:async()=>JSON.parse(v.body)}},
  async put(key,body,{onlyIf}){const stored=map.get(key);if(onlyIf.etagMatches ? stored?.etag!==onlyIf.etagMatches : stored)return null;map.set(key,{etag:crypto.randomUUID(),body});return {}},
  async list(){return {objects:[...map.keys()].filter(key=>key.startsWith('landing3/orders/')).map(key=>({key})),truncated:false}},
 };
 const env={ASSETS:{fetch:async r=>new Response(new URL(r.url).pathname)},PLAN_ORDERS:bucket,PLAN_RATE:{async limit(){return {success:true}}},PLAN_CHECKOUT_ENABLED:'true',PLAN_LEZTY_API_KEY:'sk_live_fixture_only',PLAN_LEZTY_WEBHOOK_SECRET:webhookSecret,PLAN_LEZTY_MERCHANT_VERSION:'merchant-a',PLAN_DATA_KEY_HEX:'1'.repeat(64),PLAN_SUPPORT_TOKEN:'2'.repeat(64),PLAN_PRIVACY_URL:host+'/privacy',PLAN_SALES_TERMS_URL:host+'/terms'};
 const provider=async(url,init)=>{
  assert.ok(url.startsWith('https://api.leztypay.com/v1/transactions'));assert.equal(init.redirect,'manual');
  if(init.method==='POST'){
   calls++;const body=JSON.parse(init.body);assert.equal(body.amount,FIXED_PLANS.find(p=>p.label===body.items[0].name).amountCents);
   assert.equal(body.customer.document_type,'cpf');assert.equal(body.customer.document,'11144477735');assert.equal(body.currency,'BRL');
   assert.equal('postback_url' in body,false);assert.equal(body.metadata.purpose,'saas_plan');
   assert.equal(init.headers['Idempotency-Key'],'landing3.'+body.metadata.order_id);
   transaction={id:'synthetic-tx-'+calls,object:'transaction',mode:'live',payment_method:'pix',amount:body.amount,metadata:body.metadata,
     pix:{payload:'DEMO NOT PAYABLE',expires_at:new Date(t+60_000).toISOString()}};
   if(lose)throw Error('Lost reply');
  }else{reads++;assert.equal(url,'https://api.leztypay.com/v1/transactions/'+transaction.id);}
  return Response.json({...transaction,status:currentStatus,...override});
 };
 const app=createCheckout(provider,()=>t);
 const pilot=createPilotService(provider,()=>t,{'index.html':'fixture-only'});
 const caller=privatePilot?'https://resolvflow.online':host;
 const send=(path,{method='GET',body,token,extra={}}={})=>{
  const request=new Request(caller+(privatePilot?'/planos-piloto/api':root)+path,{method,headers:{Origin:caller,...(body?{'Content-Type':'application/json'}:{}),...(token?{Cookie:token}:{}),...extra},body:body?JSON.stringify(body):undefined});
  return privatePilot?pilot(request,env):app.fetch(request,env);
 };
 const session=async()=>{const r=await send('/session',{method:'POST',body:{}});assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);return r.headers.get('set-cookie').split(';')[0];};
 const order=(requestId=crypto.randomUUID(),planId=FIXED_PLANS[0].id)=>({requestId,planId,catalogVersion:CATALOG_VERSION,acceptedTermsVersion:TERMS_VERSION,buyer:{name:'Pessoa Teste',email:'buyer@example.invalid',username:'test-account',document:'111.444.777-35'}});
 async function webhook({eventId='evt1',wrongSignature=false,modify}={}) {
   const body={id:eventId,object:'event',mode:'live',type:'transaction.paid',data:{object:{...transaction}}};
   modify?.(body);
   const raw=JSON.stringify(body),stamp=t/1000;
   const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(webhookSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
   const sig=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(stamp+'.'+raw))).toString('hex');
   return send('/webhooks/leztypay',{method:'POST',body,extra:{'x-signature':'t='+stamp+',v1='+(wrongSignature?'a'.repeat(64):sig)}});
 }
 return {env,app,pilot,map,send,session,order,webhook,get calls(){return calls;},get reads(){return reads;},lose(){lose=true;},status(n){currentStatus=n;},override(n){override=n;}};
}

test('private entrypoint uses exact principal payer and allows no public purchase or asset access',async()=>{
 const f=fixture(true);
 f.env.PLAN_CHECKOUT_ENABLED='false';f.env.PLAN_PRIVATE_PILOT_ENABLED='true';
 delete f.env.PLAN_PRIVACY_URL;delete f.env.PLAN_SALES_TERMS_URL;
 assert.equal((await f.app.fetch(new Request(host+'/_plans-private/assets/app-test.js'),f.env)).status,404);
 assert.equal((await f.app.fetch(new Request(host+root+'/support',{headers:{Authorization:'Bearer '+f.env.PLAN_SUPPORT_TOKEN}}),f.env)).status,503);
 const publicCatalog=await f.app.fetch(new Request(host+root+'/plans'),f.env);
 assert.equal((await publicCatalog.json()).enabled,false);
 assert.equal((await f.pilot(new Request(host+'/planos-piloto/api/plans'),f.env)).status,404);
 const asset=await f.pilot(new Request('https://resolvflow.online/planos-piloto/'),f.env);
 assert.equal(asset.headers.get('cache-control'),'private, no-store');
 const catalog=await(await f.send('/plans')).json();
 assert.equal(catalog.privatePilot,true);assert.equal(catalog.enabled,true);
 assert.equal(catalog.termsVersion,PILOT_ACK_VERSION);assert.equal(catalog.privacyUrl,null);
 const token=await f.session(),bad=f.order();
 assert.equal((await f.send('/orders',{method:'POST',token,body:bad})).status,409);
 bad.acceptedTermsVersion=PILOT_ACK_VERSION;
 assert.equal((await f.send('/orders',{method:'POST',token,body:bad})).status,400);
 assert.equal(f.calls,0);
 bad.buyer.email=PILOT_EMAIL;
 const created=await f.send('/orders',{method:'POST',token,body:bad});
 assert.equal(created.status,200);assert.equal((await created.json()).status,'pending');
 assert.equal(f.calls,1);
 assert.equal((await f.send('/orders/'+bad.requestId,{token})).status,200);
 assert.equal((await f.send('/orders/'+bad.requestId)).status,401);
 assert.equal((await f.app.fetch(new Request(host+root+'/orders/'+bad.requestId,{headers:{Cookie:token}}),f.env)).status,503);
});

test('five published plans, amount chosen only from server, no purchase for ranges or altered client amount',async()=>{
 const f=fixture();const catalog=await (await f.send('/plans')).json();
 assert.deepEqual(catalog.plans.map(p=>p.amountCents),[12700,29700,127000,297000,797000]);
 const token=await f.session();
 for(const [body,status] of [[{...f.order(),amountCents:500},400],[f.order(crypto.randomUUID(),'volume-operacao20'),404],[{...f.order(),catalogVersion:'old'},409],[{...f.order(),buyer:{...f.order().buyer,document:'11111111111'}},400]]) {
  assert.equal((await f.send('/orders',{method:'POST',token,body})).status,status);
 }
 assert.equal(f.calls,0);
 for(const p of FIXED_PLANS) {
  const r=await f.send('/orders',{method:'POST',token,body:f.order(crypto.randomUUID(),p.id)});
  const o=await r.json();assert.equal(o.plan.amountCents,p.amountCents);assert.equal(o.status,'pending');assert.equal(o.fulfillment,'not_started');
 }
 assert.equal(f.calls,5);
 assert.ok([...f.map.values()].every(o=>!o.body.includes('buyer@example.invalid')&&!o.body.includes('11144477735')));
});

test('disabled staging supports a signed Lezty ping without payment credentials or order writes',async()=>{
 const f=fixture();
 f.env.PLAN_CHECKOUT_ENABLED='false';
 delete f.env.PLAN_LEZTY_API_KEY;
 const ready=await f.send('/webhooks/leztypay');
 assert.deepEqual(await ready.json(),{readyForSignedPing:true,acceptingOrders:false});
 const asPing=body=>{body.type='ping';body.data={object:{endpoint_id:'fixture',url:host}};};
 assert.equal((await f.webhook({modify:asPing,wrongSignature:true})).status,401);
 assert.equal((await f.webhook({modify:asPing})).status,200);
 assert.equal((await f.send('/session',{method:'POST',body:{}})).status,503);
 assert.equal(f.calls+f.reads+f.map.size,0);
});

test('verified signed Gmail events are ignored by the landing without lookup or mutation',async()=>{
 const f=fixture();
 const modify=body=>{body.data.object={object:'transaction',id:'gmail-fixture',metadata:{workspace:'synthetic',payment_id:'legacy-local'}};};
 for(const enabled of [true,false]){
  if(!enabled){f.env.PLAN_CHECKOUT_ENABLED='false';delete f.env.PLAN_LEZTY_API_KEY;}
  const result=await f.webhook({modify});
  assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{ignored:true});
 }
 assert.equal(f.calls+f.reads+f.map.size,0);
});

test('public session capability isolates receipts and rejects cross-site writes and rate limit',async()=>{
 const f=fixture(),first=await f.session(),second=await f.session(),body=f.order();
 assert.equal((await f.send('/orders',{method:'POST',body})).status,401);
 assert.equal((await f.send('/orders',{method:'POST',token:first,body,extra:{Origin:'https://other.invalid'}})).status,403);
 assert.equal((await f.send('/orders',{method:'POST',token:first,body})).status,200);
 assert.equal((await f.send('/orders/'+body.requestId,{token:second})).status,404);
 assert.equal((await f.send('/orders/'+body.requestId,{token:first})).status,200);
 f.env.PLAN_RATE.limit=async()=>({success:false});
 assert.equal((await f.send('/orders',{method:'POST',token:first,body:f.order()})).status,429);
 assert.equal(f.calls,1);
});

test('same intent sends exactly once despite concurrency, crash or response loss',async()=>{
 const f=fixture(),token=await f.session(),body=f.order();f.lose();
 const [a,b]=await Promise.all([f.send('/orders',{method:'POST',token,body}),f.send('/orders',{method:'POST',token,body})]);
 assert.equal((await a.json()).id,(await b.json()).id);
 assert.equal((await (await f.send('/orders/'+body.requestId,{token})).json()).status,'uncertain');
 assert.equal((await f.send('/orders',{method:'POST',token,body:{...body,planId:FIXED_PLANS[1].id}})).status,409);
 assert.equal((await f.send('/orders',{method:'POST',token,body})).status,200);
 assert.equal(f.calls,1);
});

test('signed webhook reflects canonical Pix, tolerates a lost create response and cannot create access or credit',async()=>{
 const f=fixture(),token=await f.session(),body=f.order();f.lose();
 await f.send('/orders',{method:'POST',token,body});f.status('paid');
 assert.equal((await f.webhook({wrongSignature:true})).status,401);assert.equal(f.reads,0);
 f.override({amount:500});assert.equal((await f.webhook()).status,502);
 assert.equal((await (await f.send('/orders/'+body.requestId,{token})).json()).status,'uncertain');
 f.override({});assert.equal((await f.webhook()).status,200);
 const paid=await (await f.send('/orders/'+body.requestId,{token})).json();
 assert.equal(paid.fulfillment,'pending_review');assert.equal(paid.status,'paid');
 const reads=f.reads;
 assert.equal((await (await f.webhook()).json()).duplicate,true);assert.equal(f.reads,reads);
 f.status('pending');assert.equal((await f.webhook({eventId:'old'})).status,200);
 assert.equal((await (await f.send('/orders/'+body.requestId,{token})).json()).status,'paid');
 assert.equal((await f.send('/support')).status,403);
 const auth={Authorization:'Bearer '+f.env.PLAN_SUPPORT_TOKEN};
 const queue=await (await f.send('/support',{extra:auth})).json();
 assert.equal(queue.orders[0].buyer.email,body.buyer.email);
 assert.equal((await f.send('/support/handled',{method:'POST',extra:auth,body:{id:paid.id}})).status,200);
 assert.equal((await (await f.send('/orders/'+body.requestId,{token})).json()).fulfillment,'handled_manually');
 assert.equal(f.calls,1);
});

test('disabled or incomplete configuration never admits orders and preserves existing static routes',async()=>{
 const f=fixture();
 f.env.PLAN_LEZTY_WEBHOOK_SECRET=undefined;
 assert.equal((await (await f.send('/plans')).json()).enabled,false);
 assert.equal((await f.send('/session',{method:'POST',body:{}})).status,503);
 for(const path of ['/','/1/','/2/']){
  const r=await f.app.fetch(new Request(host+path),f.env);assert.equal(await r.text(),path);
  assert.equal(r.headers.get('content-security-policy'),null);
 }
 for(const path of ['/3','/3/']){
  const r=await f.app.fetch(new Request(host+path),f.env);
  assert.equal(r.status,302);
  assert.equal(r.headers.get('location'),'https://resolvflow.online/planos');
 }
 assert.equal(f.calls,0);
});

test('commercial checkout creates Pix via provider service binding without Lezty',async()=>{
 let bravoCalls=0;
 const bravo={
  async fetch(request){
   bravoCalls++;
   const url=new URL(request.url);
   assert.equal(url.pathname,'/__internal/plan-pix-bravo/transactions');
   assert.equal(request.headers.get('x-rf-plan-pix-internal'),null,'no shared gate header is sent');
   assert.equal(request.method,'POST');
   const body=await request.json();
   assert.equal(body.amountCents,FIXED_PLANS[0].amountCents);
   assert.equal(body.customer.document,'11144477735');
   return Response.json({
    id:'eyt-tx-1',
    status:'pending',
    pix:{payload:'000201EYT-DEMO-NOT-PAYABLE',expires_at:new Date(t+60_000).toISOString()},
   });
  },
 };
 const env={
  ASSETS:{fetch:async r=>new Response(new URL(r.url).pathname)},
  PLAN_ORDERS:(()=>{const map=new Map();return{
   async get(key){const v=map.get(key);return v&&{etag:v.etag,json:async()=>JSON.parse(v.body)}},
   async put(key,body,{onlyIf}){const stored=map.get(key);if(onlyIf.etagMatches?stored?.etag!==onlyIf.etagMatches:stored)return null;map.set(key,{etag:crypto.randomUUID(),body});return{}},
   async list(){return{objects:[],truncated:false}},
  };})(),
  PLAN_RATE:{async limit(){return{success:true}}},
  PLAN_CHECKOUT_ENABLED:'true',
  PLAN_BRAVO_MERCHANT_VERSION:'landing-eyt-v1',
  PLAN_PIX_BRAVO:bravo,
  PLAN_DATA_KEY_HEX:'1'.repeat(64),
  PLAN_SUPPORT_TOKEN:'2'.repeat(64),
  PLAN_PRIVACY_URL:host+'/privacy',
  PLAN_SALES_TERMS_URL:host+'/terms',
 };
 const app=createCheckout(fetch,()=>t,'commercial');
 const send=(path,{method='GET',body,token}={})=>app.fetch(new Request('https://resolvflow.online'+root+path,{
  method,headers:{Origin:'https://resolvflow.online',...(body?{'Content-Type':'application/json'}:{}),...(token?{Cookie:token}:{})},body:body?JSON.stringify(body):undefined,
 }),env);
 const plans=await(await send('/plans')).json();
 assert.equal(plans.enabled,true);
 const session=await send('/session',{method:'POST',body:{}});
 const token=session.headers.get('set-cookie').split(';')[0];
 const order={requestId:crypto.randomUUID(),planId:FIXED_PLANS[0].id,catalogVersion:CATALOG_VERSION,acceptedTermsVersion:TERMS_VERSION,buyer:{name:'Pessoa Teste',email:'buyer@example.invalid',username:'test-account',document:'111.444.777-35'}};
 const created=await(await send('/orders',{method:'POST',token,body:order})).json();
 assert.equal(created.status,'pending');
 assert.equal(created.pix.copyPaste,'000201EYT-DEMO-NOT-PAYABLE');
 assert.equal(bravoCalls,1);
});
