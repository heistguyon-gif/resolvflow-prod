import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPix, configModule, sign } from './helpers/pix-gateway-fixture.mjs';

const secret='synthetic-gmail-endpoint-secret';
const columns=new Proxy({}, {get:(_,key)=>key});
const load=(path,deps)=>loadPix(path,deps);

function fixture() {
 const payments=new Map(),events=new Map(),credits=[];
 let reads=0, response;
 const pick=table=>table==='events'||table?.name==='events'?events:payments;
 const eq=(key,value)=>row=>row[key]===value;
 const and=(...predicates)=>row=>predicates.every(p=>p(row));
 const sql=(parts)=>row=>row.status!==(parts.join('').includes("'processed'")?'processed':'paid');
 const database={
  select(){return {from:table=>({where:predicate=>({limit:async()=>[...pick(table).values()].filter(predicate).slice(0,1)})})};},
  update(table){return {set:patch=>({where:async predicate=>{for(const row of pick(table).values())if(predicate(row))Object.assign(row,patch);}})};},
  insert(table){return {values:data=>({onConflictDoNothing:()=>({returning:async()=>{const rows=pick(table);if(rows.has(data.eventId))return [];rows.set(data.eventId,data);return [{eventId:data.eventId}];}})})};}
 };
 const lib=load('lib/leztypay.ts');
 const env=()=>({LEZTYPAY_WEBHOOK_SECRET:secret,LEZTYPAY_API_KEY:'synthetic-legacy-lezty-charges'});
 const billing=load('lib/otp-billing.ts',{
  'cloudflare:workers':{env:{DB:{}}},'drizzle-orm':{eq,and,sql},'../db':{getDb:()=>database},
  '../db/schema':{otpPixWebhookEvents:new Proxy({name:'events'}, {get:(obj,key)=>obj[key]??key}),otpPayments:new Proxy({name:'payments'},{get:(obj,key)=>obj[key]??key})},
  './runtime-env':{runtimeEnv:env},'./leztypay':{...lib,async getLeztyTransaction(key,id){reads++;assert.equal(key,'synthetic-legacy-lezty-charges');assert.equal(typeof id,'string');return {payload:typeof response==='function'?await response():response};}},
  './pix-gateway-runtime':{},'./pix-gateway-config':configModule,'./otp-cancel-refund':{},'./token-crypto':{},'./otp-inbox-record':{},'./otp-inbox':{},
  './otp-wallet-transactions':{async settleOtpPayment(_db,id){const row=payments.get(id);if(row.status==='paid')return false;credits.push(id);row.status='paid';return true;}},
 });
 // Use the production route and its actual HMAC/parser while replacing only its external bindings.
 const route=load('app/api/otp/pix/webhook/route.ts',{
  '../../../../../db':{getDb:()=>database},'../../../../../db/schema':{otpPixWebhookEvents:columns},
  '../../../../../lib/otp-billing':billing,'../../../../../lib/leztypay':lib,'../../../../../lib/runtime-env':{runtimeEnv:env},
  '../../../../../lib/pix-gateway-runtime':{},'../../../../../lib/pix-gateway-config':configModule,
  '../../../../../lib/request-body':{readLimitedBody:async req=>new Uint8Array(await req.arrayBuffer()),BodyLimitError:class extends Error{}},
 });
 // Distinguish Drizzle's table object used on insert from its fixture columns.
 const originalInsert=database.insert;
 database.insert=()=>originalInsert('events');
 async function send(id='synthetic-a',eventId='evt-fixture',metadata={},key=secret){
  const body=JSON.stringify({id:eventId,object:'event',type:'transaction.paid',mode:'live',data:{object:{id,object:'transaction',metadata}}});
  return route.POST(new Request('https://resolvflow.online/api/otp/pix/webhook',{method:'POST',body,headers:{'x-signature':await sign(body,key)}}));
 }
 const tx=(metadata,id='synthetic-a')=>({id,object:'transaction',mode:'live',status:'paid',payment_method:'pix',amount:12700,metadata});
 const attach=(id,provider='leztypay',providerPaymentId='synthetic-a')=>payments.set(id,{id,provider,providerPaymentId,amountCents:12700,status:'pending'});
 return {payments,events,credits,set:value=>{response=value;},send,tx,attach,get reads(){return reads;}};
}

test('plan delivered to Gmail is ignored only after canonical classification, even with a local ID collision',async()=>{
 const f=fixture();f.attach('local-gmail');f.set(f.tx({purpose:'saas_plan',order_id:'a'.repeat(64),merchant_version:'fixture',payment_id:'local-gmail'}));
 assert.equal((await f.send('synthetic-a','evt-fixture',{payment_id:'local-gmail'})).status,200);
 assert.equal((await f.send()).status,200);assert.equal(f.reads,1);assert.equal(f.events.get('evt-fixture').status,'processed');assert.deepEqual(f.credits,[]);
 assert.equal((await f.send('different-tx')).status,409);
});

test('signed legacy delivery before provider ID attachment can be redelivered and pays once',async()=>{
 const f=fixture();f.attach('local-gmail','leztypay',null);f.set(f.tx({payment_id:'local-gmail'}));
 assert.equal((await f.send('synthetic-a','evt-fixture',{purpose:'saas_plan'})).status,503);
 assert.equal(f.events.get('evt-fixture').status,'received');assert.deepEqual(f.credits,[]);
 f.payments.get('local-gmail').providerPaymentId='synthetic-a';
 assert.equal((await f.send()).status,200);assert.equal((await f.send()).status,200);
 assert.deepEqual(f.credits,['local-gmail']);assert.equal(f.events.get('evt-fixture').status,'processed');
});

test('managed charge account notification is left to pinned handler and mismatched canonical ID fails closed',async()=>{
 const f=fixture();f.attach('managed','pixcfg:88f840d3-5045-4c86-8406-ff71494a3d51:1',null);f.set(f.tx({payment_id:'managed'},'wrong-id'));
 assert.equal((await f.send()).status,503);assert.equal(f.events.get('evt-fixture').status,'failed');
 f.set(f.tx({payment_id:'managed'}));
 assert.equal((await f.send()).status,200);assert.deepEqual(f.credits,[]);
 assert.equal((await f.send('synthetic-a','evt-forged',{},'wrong-secret')).status,401);
 assert.equal(f.events.has('evt-forged'),false);
});

test('a slower failed redelivery cannot overwrite the processed receipt or double-credit',async()=>{
 const f=fixture();f.attach('local-gmail');
 const {promise:entered,resolve:markEntered}=Promise.withResolvers();
 const {promise:release,resolve:releaseFailure}=Promise.withResolvers();
 f.set(async()=>{markEntered();await release;throw Error('Synthetic provider timeout');});
 const older=f.send();
 await entered;
 f.set(f.tx({payment_id:'local-gmail'}));
 assert.equal((await f.send()).status,200);
 releaseFailure();
 assert.equal((await older).status,503);
 assert.equal(f.events.get('evt-fixture').status,'processed');
 assert.deepEqual(f.credits,['local-gmail']);
 assert.equal(f.reads,2);
});
