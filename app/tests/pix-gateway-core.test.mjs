import test from 'node:test';import assert from 'node:assert/strict';
import{bucket,codec,database,configModule,adapterModule,paymentsModule,sign,loadPix}from'./helpers/pix-gateway-fixture.mjs';
const actor='lucasbgn.affiliate@gmail.com';
async function fixture(){const b=bucket(),c=await codec(),audit=[],f=database();const registry=configModule.createPixGatewayRegistry(b,c,async e=>audit.push(e),async()=>[]);return{...f,b,c,audit,registry};}
async function command(f,action,fields={}){const state=await f.registry.state();return f.registry.command({action,requestId:crypto.randomUUID(),expectedRevision:state.revision,...fields},actor);}
async function add(f,key='fixture-key-A',provider='bravopay'){const{state}=await command(f,'create',{label:'Fixture',provider,apiKey:key,webhookSecret:'fixture-hook-'+key});return state.gateways.at(-1);}
const input=(requestId=crypto.randomUUID())=>({requestId,workspaceOwnerUserId:'owner-a',actorUserId:'actor-a',email:'fixture@example.test',customerDocument:'11144477735',amountCents:2000});

test('Lezty optional currency is BRL only for native live PIX; other rails and explicit conflicting values fail closed',()=>{
 const tx={id:'tx_fixture',mode:'live',status:'paid',payment_method:'pix',amount:2000,metadata:{payment_id:'local_fixture'}};
 assert.equal(adapterModule.normalizePixTransaction('leztypay',tx).currency,'BRL');
 for(const patch of[{currency:'USD'},{currency:null},{currency:''},{payment_method:'card'},{payment_method:'wallet'},{mode:'test'},{intl:{currency:'BRL'}},{crypto:{coin:'usdt'}}])assert.throws(()=>adapterModule.normalizePixTransaction('leztypay',{...tx,...patch}));
 assert.throws(()=>adapterModule.normalizePixTransaction('bravopay',{id:'tx',method:'pix',status:'paid',amount_cents:2000,external_reference:'local_fixture'}));
});

test('checkout document capability follows selected managed/legacy gateway and direct mode, independent of env Lezty',()=>{
 const legacy=provider=>({legacy:true,ref:{configId:'legacy-'+provider,version:1}});
 for(const active of [{legacy:false},legacy('leztypay')]){
  assert.equal(configModule.pixCheckoutCapabilities(active,false).pixRequiresDocument,true);
  assert.equal(configModule.pixCheckoutCapabilities(active,true).pixRequiresDocument,false);
 }
 assert.equal(configModule.pixCheckoutCapabilities(legacy('bravopay'),false).pixRequiresDocument,false);
 assert.equal(configModule.pixCheckoutCapabilities(null,false).pixEnabled,false);
 assert.equal(configModule.pixCheckoutCapabilities({legacy:false},true).pixEnabled,false);
});

test('registry is encrypted/write-only, explicit activation, immutable versions and old pin survives rotation',async()=>{
 const f=await fixture();const a=await add(f);assert.equal((await f.registry.state()).active,null);assert.equal(a.verification,'not_checked');assert.ok(!JSON.stringify(a).includes('fixture-key'));
 assert.ok(![...f.b.rows.values()].some(v=>v.body.includes('fixture-key')));
 await command(f,'activate',{configId:a.id,version:1});
 await command(f,'revise',{configId:a.id,label:'Rotated',apiKey:'fixture-key-B'});
 const state=await f.registry.state();assert.equal(state.active.version,1);assert.equal(state.gateways[0].version,2);assert.equal(state.gateways[0].activeVersion,1);
 assert.equal((await f.registry.resolve({configId:a.id,version:1})).apiKey,'fixture-key-A');assert.equal((await f.registry.resolve({configId:a.id,version:2})).apiKey,'fixture-key-B');
 await assert.rejects(command(f,'archive',{configId:a.id}),e=>e.code==='active_config');f.sqlite.close();
});

test('principal/revision/input/idempotency and audit repair guard configuration mutation',async()=>{
 const f=await fixture(),request={action:'create',requestId:crypto.randomUUID(),expectedRevision:'0',label:'Fixture',provider:'bravopay',apiKey:'fixture-key',webhookSecret:'fixture-hook'};
 await assert.rejects(f.registry.command(request,'admin@example.test'),e=>e.status===403);
 const first=await f.registry.command(request,actor);const replay=await f.registry.command({...request},actor);assert.equal(first.state.gateways[0].id,replay.state.gateways[0].id);
 await assert.rejects(f.registry.command({...request,label:'Different'},actor),e=>e.code==='request_conflict');
 await assert.rejects(f.registry.command({...request,requestId:crypto.randomUUID()},actor),e=>e.code==='revision_conflict');
 await assert.rejects(command(f,'create',{label:'X',provider:'arbitrary',apiKey:'fake',webhookSecret:'fake',url:'https://evil.test'}),e=>e.code==='invalid_input');
 let fail=true;const r=configModule.createPixGatewayRegistry(f.b,f.c,async()=>{if(fail)throw Error('audit unavailable');},async()=>[]);
 const create={...request,requestId:crypto.randomUUID(),expectedRevision:'1'};await assert.rejects(r.command(create,actor));fail=false;
 assert.equal((await r.command(create,actor)).state.gateways.length,2);f.sqlite.close();
});

test('reuse existing legacy key stays inside codec and never activates it implicitly',async()=>{
 const f=await fixture(),registry=configModule.createPixGatewayRegistry(f.b,f.c,async()=>{},async()=>[{provider:'leztypay',hasApiKey:true,hasWebhookSecret:true},{provider:'bravopay',hasApiKey:true,hasWebhookSecret:false}],Date.now,async()=> 'bp_live_fixture-legacy-private');
 const request={action:'create',requestId:crypto.randomUUID(),expectedRevision:'0',label:'Bravo reused',provider:'bravopay',reuseLegacyKey:true,webhookSecret:'fixture-new-hook'};
 const {state}=await registry.command(request,actor);assert.equal(state.active.configId,'legacy-leztypay');assert.ok(!JSON.stringify(state).includes('fixture-legacy-private'));assert.equal(request.apiKey,undefined);
 assert.equal((await registry.command({...request},actor)).state.gateways.length,3);f.sqlite.close();
});

test('legacy reuse rejects an unrelated token shape without exposing it or persisting a new configuration',async()=>{
 const b=bucket(),c=await codec(),registry=configModule.createPixGatewayRegistry(b,c,async()=>{},async()=>[],Date.now,async()=> 'fixture-unrelated-token');
 await assert.rejects(registry.command({action:'create',requestId:crypto.randomUUID(),expectedRevision:'0',label:'Fixture',provider:'bravopay',reuseLegacyKey:true,webhookSecret:'fixture-hook'},actor),e=>e.code==='legacy_credential_incompatible'&&!e.message.includes('unrelated-token'));
 assert.equal((await registry.state()).gateways.length,0);assert.equal(b.rows.size,0);
});

test('concurrent configuration CAS permits one update and never combines secrets',async()=>{
 const f=await fixture(),make=n=>f.registry.command({action:'create',requestId:crypto.randomUUID(),expectedRevision:'0',label:'Fixture'+n,provider:'bravopay',apiKey:'fixture-key'+n,webhookSecret:'fixture-hook'+n},actor);
 const results=await Promise.allSettled([make(1),make(2)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal((await f.registry.state()).gateways.length,1);f.sqlite.close();
});

test('create has one durable identity under concurrency and uncertain response never creates a second charge',async()=>{
 const f=await fixture(),a=await add(f);await command(f,'activate',{configId:a.id,version:1});let buys=0;
 const payments=paymentsModule.createPixGatewayPayments(f.db,f.b,f.c,f.registry,{create:async()=>{buys++;throw Error('response lost');}});
 const payload=input();const results=await Promise.all([payments.create(payload),payments.create({...payload})]);assert.equal(results[0].id,results[1].id);assert.equal(buys,1);assert.equal(results[0].status,'creating');
 await payments.create(payload);assert.equal(buys,1);await assert.rejects(payments.create({...payload,amountCents:3000}),e=>e.code==='request_conflict');assert.equal(f.balance(),0);
 await assert.rejects(payments.refresh(results[0].id,'owner-b'),e=>e.status===404);f.sqlite.close();
});

test('same external ID and event ID across accounts/configs cannot collide; switch/rotation uses original credential',async()=>{
 const f=await fixture(),a=await add(f),calls=[],transactions=new Map();await command(f,'activate',{configId:a.id,version:1});
 const fake={async create(origin,p){calls.push(['create',origin.apiKey]);const tx={id:'tx_shared',status:'pending',amountCents:p.amountCents,currency:'BRL',reference:p.id,qrCode:'fixture-qr'};transactions.set(origin.apiKey,tx);return tx;},async lookup(origin){calls.push(['lookup',origin.apiKey]);return transactions.get(origin.apiKey);},async webhook(_origin,raw){return{eventId:'evt_shared',transaction:JSON.parse(raw)};}};
 const payments=paymentsModule.createPixGatewayPayments(f.db,f.b,f.c,f.registry,fake),first=await payments.create(input());
 const b=await add(f,'fixture-key-B');await command(f,'activate',{configId:b.id,version:1});await command(f,'revise',{configId:a.id,label:'Old account rotated',apiKey:'fixture-key-A2'});
 const second=await payments.create(input());assert.notEqual(first.id,second.id);
 transactions.get('fixture-key-A').status='paid';transactions.get('fixture-key-B').status='paid';
 await Promise.all([payments.webhook({configId:a.id,version:1},JSON.stringify(transactions.get('fixture-key-A')),new Headers()),payments.webhook({configId:a.id,version:1},JSON.stringify(transactions.get('fixture-key-A')),new Headers())]);
 await payments.webhook({configId:b.id,version:1},JSON.stringify(transactions.get('fixture-key-B')),new Headers());
 assert.equal(f.balance(),4000);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM otp_ledger').get().n,2);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM otp_pix_webhook_events').get().n,2);
 assert.ok(calls.some(c=>c[0]==='lookup'&&c[1]==='fixture-key-A'));assert.ok(!calls.some(c=>c[1]==='fixture-key-A2'));
 const foreign={...transactions.get('fixture-key-A'),reference:second.id};await assert.rejects(payments.webhook({configId:a.id,version:1},JSON.stringify(foreign),new Headers()),e=>e.status===404);f.sqlite.close();
});

test('signed callbacks require correct per-version secret, raw bytes, timestamp and canonical identity',async()=>{
 const origin={provider:'bravopay',apiKey:'fixture-key',webhookSecret:'fixture-whsec',ref:{configId:crypto.randomUUID(),version:1},namespace:'fixture'};
 const adapters=adapterModule.createPixGatewayAdapters(()=>assert.fail('No transport'));
 const value={id:'evt_fixture',type:'transaction.paid',data:{id:'tx_fixture',status:'PAID',method:'PIX',currency:'BRL',amount_cents:2000,external_reference:'local_fixture',pix:null}},raw=JSON.stringify(value);
 const header=await sign(raw,origin.webhookSecret);assert.equal((await adapters.webhook(origin,raw,new Headers({'BravoPay-Signature':header}))).transaction.amountCents,2000);
 for(const [body,h]of[[raw+' ',header],[raw,await sign(raw,'other-secret')],[raw,await sign(raw,origin.webhookSecret,Math.floor(Date.now()/1000)-301)],[raw,'']])await assert.rejects(adapters.webhook(origin,body,new Headers({'BravoPay-Signature':h})),e=>e.code==='invalid_signature');
 const good={id:'tx_fixture',status:'PAID',method:'PIX',currency:'BRL',amount_cents:2000,external_reference:'local_fixture'};
 for(const patch of[{currency:'USD'},{method:'CARD'},{amount_cents:'2000'},{amount_cents:1.1},{status:'UNKNOWN'},{external_reference:null}])assert.throws(()=>adapterModule.normalizePixTransaction('bravopay',{...good,...patch}));
});

test('canonical amount mismatch never credits; expired observation cannot erase paid and late canonical paid is reconciled',async()=>{
 const f=await fixture(),a=await add(f);await command(f,'activate',{configId:a.id,version:1});let current;
 const adapters={async create(_o,p){current={id:'tx_fixture',reference:p.id,amountCents:2000,currency:'BRL',status:'expired',qrCode:null};return current;},async lookup(){return current;}};
 const payments=paymentsModule.createPixGatewayPayments(f.db,f.b,f.c,f.registry,adapters),p=await payments.create(input());assert.equal(p.status,'expired');
 current={...current,status:'paid',amountCents:3000};await assert.rejects(payments.refresh(p.id,'owner-a'),e=>e.code==='payment_identity_mismatch');assert.equal(f.balance(),0);
 current.amountCents=2000;await payments.refresh(p.id,'owner-a');assert.equal(f.balance(),2000);
 current.status='expired';assert.equal((await payments.refresh(p.id,'owner-a')).status,'paid');assert.equal(f.balance(),2000);f.sqlite.close();
});

test('adapters never follow redirect or send credentials to an admin URL; bounded JSON and error projection',async()=>{
 const origin={provider:'bravopay',apiKey:'fixture-secret',webhookSecret:'fixture-whsec',ref:{configId:crypto.randomUUID(),version:1},namespace:'fixture'};
 let calls=0;const adapters=adapterModule.createPixGatewayAdapters(async(url,options)=>{calls++;assert.equal(new URL(url).origin,'https://bravopay.club');assert.equal(options.redirect,'manual');assert.equal(options.credentials,'omit');return new Response('',{status:302,headers:{location:'https://evil.test'}});});
 await assert.rejects(adapters.lookup(origin,'tx_fixture'),e=>e.code==='provider_redirect'&&!e.message.includes('fixture-secret'));assert.equal(calls,1);
 await assert.rejects(adapters.lookup(origin,'../evil'),e=>e.status===400);assert.equal(calls,1);
 const oversized=adapterModule.createPixGatewayAdapters(async()=>new Response('x'.repeat(262145)));await assert.rejects(oversized.lookup(origin,'tx_fixture'),e=>e.code==='provider_unavailable');
});

test('admin route enforces principal plus exact origin without touching provider or returning write-only fields',async()=>{
 let email=actor,commands=0;const route=loadPix('app/api/admin/otp/pix-gateways/route.ts',{
  '../../../../../lib/auth':{requirePlatformOwner:async()=>({email,accountUserId:'principal-fixture'}),authErrorResponse:()=>null},
  '../../../../../lib/pix-gateway-runtime':{pixGatewayRuntime:()=>({registry:{state:async()=>({revision:'0',gateways:[]}),command:async()=>{commands++;return{state:{revision:'1',gateways:[]}};}}})},
  '../../../../../lib/pix-gateway-config':configModule,
 });
 const request=origin=>new Request('https://fixture.test/api/admin/otp/pix-gateways',{method:'POST',headers:{origin},body:'{}'});
 assert.equal((await route.POST(request('https://evil.test'))).status,403);email='admin@example.test';assert.equal((await route.POST(request('https://fixture.test'))).status,403);assert.equal(commands,0);
 email=actor;assert.equal((await route.POST(request('https://fixture.test'))).status,200);assert.equal(commands,1);
 const response=await route.GET(new Request('https://fixture.test/api/admin/otp/pix-gateways'));assert.match(response.headers.get('cache-control'),/no-store/);
 const tooLarge=new Request('https://fixture.test/api/admin/otp/pix-gateways',{method:'POST',headers:{origin:'https://fixture.test'},body:'x'.repeat(32769)});assert.equal((await route.POST(tooLarge)).status,413);assert.equal(commands,1);
});

test('verified paid revival and credit are atomic even when an expired observation wins just before the batch',async()=>{
 const f=database(),settle=loadPix('lib/otp-wallet-transactions.ts').settleOtpPayment;
 f.sqlite.prepare("INSERT INTO otp_payments(id,workspace_owner_user_id,actor_user_id,provider,provider_payment_id,amount_cents,status) VALUES('fixture','owner','actor','leztypay','tx',2000,'expired')").run();
 assert.equal(await settle(f.db,'fixture','Fixture'),false);assert.equal(f.balance(),0);
 const wrapped={...f.db,batch(statements){f.sqlite.prepare("UPDATE otp_payments SET status='expired' WHERE id='fixture' AND status!='paid'").run();return f.db.batch(statements);}};
 assert.equal(await settle(wrapped,'fixture','Fixture',{verifiedCanonicalPaid:true}),true);assert.equal(f.balance(),2000);
 assert.equal(await settle(wrapped,'fixture','Fixture',{verifiedCanonicalPaid:true}),false);assert.equal(f.balance(),2000);
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM otp_ledger').get().n,1);f.sqlite.close();
});

test('provider create contracts use documented fields and same immutable idempotency key, with no cross-provider fallback',async()=>{
 for(const provider of ['bravopay','leztypay']){
  const origin={provider,apiKey:'fixture-key',webhookSecret:'fixture-hook',ref:{configId:crypto.randomUUID(),version:1},namespace:'fixture'};
  let calls=0;const adapters=adapterModule.createPixGatewayAdapters(async(url,init)=>{
   calls++;assert.equal(url,provider==='bravopay'?'https://bravopay.club/api/v1/transactions':'https://api.leztypay.com/v1/transactions');assert.equal(init.method,'POST');assert.equal(init.headers['Idempotency-Key'],'pix.local_fixture');
   const body=JSON.parse(init.body);assert.equal(body.metadata.payment_id,'local_fixture');
   if(provider==='bravopay'){assert.equal(body.amount_cents,2000);assert.equal(body.external_reference,'local_fixture');assert.equal(body.method,'pix');assert.equal(body.currency,undefined);}
   else{assert.equal(body.currency,'BRL');assert.equal(body.amount,2000);assert.equal(body.payment_method,'pix');assert.equal(body.postback_url,`https://resolvflow.online/api/otp/pix/webhook?configId=${origin.ref.configId}&version=1`);}
   return Response.json(provider==='bravopay'?{id:'tx_fixture',status:'PENDING',method:'PIX',currency:'BRL',amount_cents:2000,external_reference:'local_fixture',pix:{copy_paste:'fixture-qr'}}:{id:'tx_fixture',status:'pending',payment_method:'pix',currency:'BRL',amount:2000,mode:'live',metadata:{payment_id:'local_fixture'},pix:{payload:'fixture-qr'}});
  });
  assert.equal((await adapters.create(origin,{id:'local_fixture',amountCents:2000,email:'fixture@example.test',name:'Fixture',document:'11144477735'})).qrCode,'fixture-qr');assert.equal(calls,1);
 }
});

test('lookup cannot substitute a different transaction ID, even with matching reference and amount',async()=>{
 const origin={provider:'bravopay',apiKey:'fixture-key',webhookSecret:'fixture-hook',ref:{configId:crypto.randomUUID(),version:1},namespace:'fixture'};
 const adapters=adapterModule.createPixGatewayAdapters(async()=>Response.json({id:'tx_other',status:'PAID',method:'PIX',currency:'BRL',amount_cents:2000,external_reference:'local_fixture'}));
 await assert.rejects(adapters.lookup(origin,'tx_requested'),e=>e.code==='payment_identity_mismatch');
});

test('no provider ID after lost create is repaired by a signed/canonical webhook for the same receipt, without another POST',async()=>{
 const f=await fixture(),a=await add(f);await command(f,'activate',{configId:a.id,version:1});let buys=0,reference;
 const adapters={async create(_o,p){buys++;reference=p.id;throw Error('lost');},async webhook(_o,raw){return{eventId:'evt_fixture',transaction:JSON.parse(raw)};},async lookup(){return{id:'tx_late',status:'paid',reference,amountCents:2000,currency:'BRL',qrCode:null};}};
 const payments=paymentsModule.createPixGatewayPayments(f.db,f.b,f.c,f.registry,adapters),payload=input(),p=await payments.create(payload);
 const tx={id:'tx_late',reference,amountCents:2000};await payments.webhook({configId:a.id,version:1},JSON.stringify(tx),new Headers());
 assert.equal((await payments.create(payload)).status,'paid');assert.equal(buys,1);assert.equal(f.balance(),2000);assert.equal((await payments.refresh(p.id,'owner-a')).status,'paid');f.sqlite.close();
});

test('a ledger failure rolls back verified revival, balance and payment status together',async()=>{
 const f=database(),settle=loadPix('lib/otp-wallet-transactions.ts').settleOtpPayment;
 f.sqlite.prepare("INSERT INTO otp_payments(id,workspace_owner_user_id,actor_user_id,provider,provider_payment_id,amount_cents,status) VALUES('fixture','owner','actor','leztypay','tx',2000,'expired')").run();
 f.sqlite.exec("CREATE TRIGGER ledger_failure BEFORE INSERT ON otp_ledger BEGIN SELECT RAISE(FAIL,'fixture'); END");
 await assert.rejects(settle(f.db,'fixture','Fixture',{verifiedCanonicalPaid:true}));assert.equal(f.balance(),0);assert.equal(f.sqlite.prepare("SELECT status FROM otp_payments WHERE id='fixture'").get().status,'expired');f.sqlite.close();
});

test('legacy credit keeps provider scope and never sends a Bravo key to Lezty when the original credential is missing',async()=>{
 const f=database(),values={LEZTYPAY_API_KEY:'fixture-lezty',BRAVOPAY_API_KEY:'fixture-bravo'};
 const row={id:'local_fixture',provider:'leztypay',providerPaymentId:'tx_shared',amountCents:2000,status:'pending'};
 f.sqlite.prepare("INSERT INTO otp_payments(id,workspace_owner_user_id,actor_user_id,provider,provider_payment_id,amount_cents,status) VALUES('local_fixture','owner','actor','leztypay','tx_shared',2000,'pending')").run();
 let lookups=0;const filters=[];
 const billing=loadPix('lib/otp-billing.ts',{
  './pix-gateway-runtime':{},'./pix-gateway-config':configModule,'cloudflare:workers':{env:{DB:f.db}},
  'drizzle-orm':{eq:(field,value)=>({field,value}),and:(...conditions)=>conditions},
  '../db':{getDb:()=>({select:()=>({from(){return this;},where(filter){filters.push(filter);return this;},limit:async()=>[row]})})},
  '../db/schema':{otpPayments:{provider:'provider',providerPaymentId:'providerPaymentId'}},'./otp-cancel-refund':{},'./runtime-env':{runtimeEnv:()=>values},'./token-crypto':{},'./otp-inbox-record':{},'./otp-inbox':{},
  './leztypay':{...loadPix('lib/leztypay.ts'),getLeztyTransaction:async(key,id)=>{lookups++;assert.equal(key,'fixture-lezty');assert.equal(id,'tx_shared');return{payload:{id,status:'paid',amount:2000,payment_method:'pix',mode:'live',metadata:{payment_id:'local_fixture'}}};},leztyPaymentState:s=>s},
 });
 delete values.LEZTYPAY_API_KEY;await assert.rejects(billing.applyApprovedPix('tx_shared','leztypay'),e=>e.code==='legacy_credential_unavailable');assert.equal(lookups,0);assert.equal(f.balance(),0);
 values.LEZTYPAY_API_KEY='fixture-lezty';assert.equal((await billing.applyApprovedPix('tx_shared','leztypay')).applied,true);assert.equal(f.balance(),2000);
 assert.deepEqual(filters[0],[{field:'provider',value:'leztypay'},{field:'providerPaymentId',value:'tx_shared'}]);f.sqlite.close();
});

test('unsigned GET/POST cannot settle legacy Bravo; signed Bravo is independently verified even while Lezty exists',async()=>{
 let calls=0;const route=loadPix('app/api/otp/pix/webhook/route.ts',{
  'cloudflare:workers':{waitUntil:()=>assert.fail('No background job')},'../../../../../db':{},'../../../../../db/schema':{},
  '../../../../../lib/otp-billing':{settleBravoPayNotification:async()=>{calls++;}},
  '../../../../../lib/runtime-env':{runtimeEnv:()=>({LEZTYPAY_WEBHOOK_SECRET:'fixture-lezty-hook',BRAVOPAY_WEBHOOK_SECRET:'fixture-bravo-hook'})},
  '../../../../../lib/pix-gateway-runtime':{pixGatewayRuntime:()=>assert.fail('No managed context')},'../../../../../lib/pix-gateway-config':configModule,
 });
 assert.equal((await route.GET(new Request('https://fixture.test/api/otp/pix/webhook?transaction_id=tx_fixture'))).status,200);assert.equal(calls,0);
 const raw=JSON.stringify({id:'evt_fixture',type:'transaction.paid',data:{id:'tx_fixture'}}),url='https://fixture.test/api/otp/pix/webhook';
 assert.equal((await route.POST(new Request(url,{method:'POST',body:raw}))).status,401);
 const signature=await sign(raw,'fixture-bravo-hook');assert.equal((await route.POST(new Request(url,{method:'POST',body:raw,headers:{'BravoPay-Signature':signature}}))).status,200);assert.equal(calls,1);
 const tooLarge=new Request(url,{method:'POST',body:'x'.repeat(262145)});assert.equal((await route.POST(tooLarge)).status,413);assert.equal(calls,1);
});
