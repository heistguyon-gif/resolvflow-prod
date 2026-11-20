import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPix } from './helpers/pix-gateway-fixture.mjs';
const pilotPath='https://resolvflow.online/planos-piloto';
const email='lucasbgn.affiliate@gmail.com';
const principal={email,workspaceOwnerUserId:'nexoflow:'+email,role:'owner'};
let identity=null, forwarded;
const service={async fetch(request){forwarded=request;return new Response('pilot',{headers:{'set-cookie':'__Host-rf-plan-checkout='+'b'.repeat(64)+'; Secure; HttpOnly; Path=/'}});}};
const gate=loadPix('lib/plan-checkout-pilot.ts');
const route=loadPix('app/planos-piloto/[[...parts]]/route.ts',{
 'cloudflare:workers':{env:{PLAN_CHECKOUT_PILOT:service}},
 '../../../lib/auth':{async requirePlatformOwner(){if(!identity)throw Error('unauthenticated');return identity;},authErrorResponse(){return Response.json({error:'unauthorized'},{status:401});}},
 '../../../lib/plan-checkout-pilot':gate,
});
test('every private document, asset and order route checks principal before the service binding',async()=>{
 for(const routePath of ['', '/assets/app-X.js','/api/plans','/api/orders/a']){
  for(const candidate of [null,{...principal,email:'other@example.invalid'},{...principal,workspaceOwnerUserId:'other'},{...principal,role:'viewer'},{...principal,mustChangePassword:true}]){
   identity=candidate;forwarded=undefined;
   const resp=await route.GET(new Request(pilotPath+routePath,{headers:{'oai-authenticated-user-email':email}}));
   assert.equal(resp.status,candidate?403:401);assert.equal(forwarded,undefined);
  }
 }
 identity=principal;
 assert.equal((await route.GET(new Request('https://top.resolvflow.online/planos-piloto'))).status,404);
 assert.equal(forwarded,undefined);
});
test('pilot proxy blocks cross-site mutations and forwards no real ResolvFlow authentication cookie',async()=>{
 identity=principal;forwarded=undefined;
 const URL=pilotPath+'/api/session';
 assert.equal((await route.POST(new Request(URL,{method:'POST',headers:{origin:'https://other.invalid'},body:'{}'}))).status,403);
 assert.equal(forwarded,undefined);
 assert.equal((await route.POST(new Request(URL,{method:'POST',headers:{origin:'https://resolvflow.online'},body:'x'.repeat(4097)}))).status,413);
 assert.equal(forwarded,undefined);
 const session='__Host-rf-plan-checkout='+'a'.repeat(64);
 const response=await route.POST(new Request(URL,{method:'POST',headers:{origin:'https://resolvflow.online',cookie:'operation-session=synthetic-private-cookie; '+session,'content-type':'application/json',authorization:'Bearer synthetic-test'},body:'{}'}));
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.equal(forwarded.headers.get('cookie'),session);assert.equal(forwarded.headers.get('authorization'),null);assert.equal(await forwarded.text(),'{}');
});
