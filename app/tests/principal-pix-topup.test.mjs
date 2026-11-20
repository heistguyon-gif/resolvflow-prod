import test from 'node:test';import assert from 'node:assert/strict';
import {loadPix,bucket,codec,configModule} from './helpers/pix-gateway-fixture.mjs';
const email='lucasbgn.affiliate@gmail.com',owner='nexoflow:'+email;
let calls=0;
const billing=loadPix('lib/otp-billing.ts',{'cloudflare:workers':{env:{}},'drizzle-orm':{eq:()=>true},'../db':{getDb:()=>({select:()=>({from(){return this},where(){return this},limit:async()=>[{id:'default',minDepositCents:2000}]})})},'../db/schema':{otpSettings:{id:'id'}},'./otp-cancel-refund':{},'./runtime-env':{runtimeEnv:()=>({NEXOFLOW_OWNER_EMAIL:email})},'./token-crypto':{},'./otp-inbox-record':{},'./otp-inbox':{},'./leztypay':{},'./pix-gateway-config':configModule,'./pix-gateway-runtime':{pixGatewayRuntime:()=>({registry:{active:async()=>({legacy:false})},payments:{resume:async()=>null,create:async input=>{calls++;return {status:'pending',amountCents:input.amountCents}}}})}});
test('only principal authenticated actor in own workspace gets500, all other configured minimums preserved',()=>{
 for(const [e,o,yes]of[[email,owner,true],[' LUCASBGN.AFFILIATE@GMAIL.COM ',owner,true],['other@test',owner,false],[email,'other',false]]){assert.equal(billing.isPrincipalPixTopup(e,o),yes);assert.equal(billing.otpMinDepositFor(e,o,2000),yes?500:2000);assert.equal(billing.otpMinDepositFor(e,o,7000),yes?500:7000);}
});
test('real billing rejects below500/invalid/above maximum before adapter;500 stays pending and never credits',async()=>{
 // Add only the query predicate used to read synthetic settings.
 for(const amount of [0,499,499.9,500.1,NaN,Infinity,500001])await assert.rejects(billing.createPixCharge({workspaceOwnerUserId:owner,actorUserId:'fixture',email,customerDocument:'11144477735',amountCents:amount}));
 assert.equal(calls,0);
 const payment=await billing.createPixCharge({workspaceOwnerUserId:owner,actorUserId:'fixture',email,customerDocument:'11144477735',amountCents:500});assert.equal(payment.status,'pending');assert.equal(payment.amountCents,500);assert.equal(calls,1);
 await assert.rejects(billing.createPixCharge({workspaceOwnerUserId:'other',actorUserId:'fixture',email:'other@test',customerDocument:'11144477735',amountCents:500}));assert.equal(calls,1);
});
test('legacy Lezty return selectable from Bravo, origin of existing managed version preserved',async()=>{
 let complete=true;const b=bucket(),registry=configModule.createPixGatewayRegistry(b,await codec(),async()=>{},async()=>[{provider:'leztypay',hasApiKey:true,hasWebhookSecret:complete}]);
 async function command(action,fields){return registry.command({action,requestId:crypto.randomUUID(),expectedRevision:(await registry.state()).revision,...fields},email)}
 const created=(await command('create',{label:'Bravo',provider:'bravopay',apiKey:'synthetic',webhookSecret:'synthetic-hook'})).state.gateways.find(g=>g.origin==='managed');
 await command('activate',{configId:created.id,version:1});const pinned=await registry.resolve({configId:created.id,version:1});
 await command('activate',{configId:'legacy-leztypay',version:1});assert.equal((await registry.active()).ref.configId,'legacy-leztypay');assert.equal((await registry.resolve({configId:created.id,version:1})).namespace,pinned.namespace);
 complete=false;await assert.rejects(registry.active(),e=>e.code==='gateway_unavailable');await assert.rejects(command('activate',{configId:'legacy-leztypay',version:1}),e=>e.code==='legacy_incomplete');
 await assert.rejects(command('activate',{configId:'legacy-bravopay',version:1}),e=>e.code==='config_not_found');
});
