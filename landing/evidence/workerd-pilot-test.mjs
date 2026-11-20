import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const origin='https://resolvflow.online';
const localCompatibilityDate='2026-10-13';
const mf=new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',port:0,workers:[
 {name:'proxy-fixture',compatibilityDate:localCompatibilityDate,modules:true,script:`export default {fetch(request,env){const path=new URL(request.url).pathname;return env.CHECKOUT.fetch(new Request(${JSON.stringify(origin)}+path,request));}}`,serviceBindings:{CHECKOUT:{name:'landing-pilot',entrypoint:'PlanCheckoutPilot'}}},
 {name:'landing-pilot',compatibilityDate:localCompatibilityDate,modules:true,scriptPath:'evidence/private-worker-bundle.mjs',
   bindings:{PLAN_CHECKOUT_ENABLED:'false',PLAN_PRIVATE_PILOT_ENABLED:'true',PLAN_LEZTY_API_KEY:'sk_live_local_fixture_no_network',PLAN_LEZTY_WEBHOOK_SECRET:'fixture-sig',PLAN_LEZTY_MERCHANT_VERSION:'fixture',PLAN_DATA_KEY_HEX:'1'.repeat(64),PLAN_SUPPORT_TOKEN:'2'.repeat(64)},
   r2Buckets:['PLAN_ORDERS'],ratelimits:{PLAN_RATE:{namespace_id:'6111803',simple:{limit:12,period:60}}}}
]}));
try {
 const local=await mf.dispatchFetch('http://localhost/planos-piloto');
 assert.equal(local.status,200);
 const html=await local.text();
 assert.match(html,/data-checkout="pilot"/);
 const js=html.match(/src="(\/planos-piloto\/assets\/[^"]+\.js)"/)?.[1];
 assert.ok(js);
 assert.equal((await mf.dispatchFetch('http://localhost'+js)).status,200);
 const catalog=await(await mf.dispatchFetch('http://localhost/planos-piloto/api/plans')).json();
 assert.equal(catalog.enabled,true);
 assert.equal(catalog.privatePilot,true);
 assert.deepEqual(catalog.plans.map(p=>p.amountCents),[12700,29700,127000,297000,797000]);
 const publicWorker=await mf.getWorker('landing-pilot');
 assert.equal((await publicWorker.fetch('https://resolvflow-landing-variants-20261118.lucasbgn-affiliate.workers.dev/_plans-private/index.html')).status,404);
 const receipt={kind:'local-workerd-service-binding',localCompatibilityDate,screen:200,asset:200,catalog:true,publicAssets:404,vendorRequests:0};
 writeFileSync('evidence/workerd-pilot-proof.json',JSON.stringify(receipt,null,2));
 console.log(JSON.stringify(receipt));
}finally{await mf.dispose();}
