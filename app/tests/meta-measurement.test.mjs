import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPix, bucket } from "./helpers/pix-gateway-fixture.mjs";

const load = name => loadPix("lib/measurement/" + name + ".ts");
const { PUBLIC_ORIGIN, PUBLIC_PATH, OWNER_SCOPE, attribution, ownWorkspace, digest } = load("model");
const { measurementStore } = load("storage");
const { saveChoice, recordBrowser, recordConversion } = load("collection");
const { measureCheckout } = load("checkout");
const { publicMeasurement } = load("http");
const { isPublicMeasurementRoute } = load("routing");
const { metaDispatch } = load("meta");
const { fixtureSnapshot, report, emptyFilters, readSnapshot } = load("report");
const { recordUsage } = load("usage");
const channel = "https://resolvflow.online/planos";
const session = "a".repeat(64);
const match = {fbp: "fb.1.1760000000000.12345", userAgent: "Synthetic browser"};
const attr = {source: "direct", campaign: null, landing: "planos"};

function fakeStorage() {
  const fake = bucket();
  fake.list = async ({prefix}) => ({objects:[...fake.rows.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key})),truncated:false});
  return {store:measurementStore(fake), rows:fake.rows};
}
function server(eventList = []) {
  return {enabled:true,pixel:true,async dispatch(spec){eventList.push(spec);return "accepted";}};
}
async function consent(store, analytics=true, marketing=true) {
  await saveChoice(store,session,{analytics,marketing},Date.now()-3000);
}
function request(body, origin=PUBLIC_ORIGIN, rawCookie="", referrer=channel) {
  return new Request(PUBLIC_ORIGIN+"/api/measurement/public", {
    method:"POST", headers:{origin,referer:referrer,"content-type":"application/json",cookie:rawCookie},
    body:JSON.stringify(body),
  });
}

test("public flag absent and non-commercial routes stay outside the public exception", () => {
  assert.equal(isPublicMeasurementRoute(new URL(channel),"GET"),false);
  assert.equal(isPublicMeasurementRoute(new URL(channel),"GET","true"),true);
  assert.equal(isPublicMeasurementRoute(new URL(channel),"POST","true"),false);
  for (const url of [PUBLIC_ORIGIN+"/",PUBLIC_ORIGIN+"/login",PUBLIC_ORIGIN+"/dashboard",PUBLIC_ORIGIN+"/planos-piloto",
    PUBLIC_ORIGIN+"/api/admin/measurement","https://preview.workers.dev/planos"]) {
    assert.equal(isPublicMeasurementRoute(new URL(url),"GET","true"),false);
  }
});

test("exact principal, workspace and owner role are jointly required", () => {
  const email=" LUCASBGN.AFFILIATE@GMAIL.COM ";
  assert.equal(ownWorkspace(email,OWNER_SCOPE,"owner"),true);
  assert.equal(ownWorkspace(email,"nexoflow:other","owner"),false);
  assert.equal(ownWorkspace("other@example.test",OWNER_SCOPE,"owner"),false);
  assert.equal(ownWorkspace(email,OWNER_SCOPE,"viewer"),false);
});

test("real admin route rejects wrong memberships and uses distinctly labeled fixtures without a configured backend", async () => {
  let caller = {email:"nobody@example.test",workspaceOwnerUserId:OWNER_SCOPE,role:"owner"};
  const route = loadPix("app/api/admin/measurement/route.ts",{
    "../../../../lib/auth":{requirePlatformOwner:async()=>caller,authErrorResponse:()=>null},
    "../../../../lib/measurement/runtime":{measurementRuntime:()=>({store:null,config:{enabled:false}})},
  });
  const get = () => route.GET(new Request(PUBLIC_ORIGIN+"/api/admin/measurement"));
  assert.equal((await get()).status,403);
  caller = {...caller,email:"lucasbgn.affiliate@gmail.com",workspaceOwnerUserId:"other"};
  assert.equal((await get()).status,403);
  caller = {...caller,workspaceOwnerUserId:OWNER_SCOPE};
  const ok = await get();
  assert.match(ok.headers.get("cache-control"),/no-store/);
  assert.equal((await ok.json()).mode,"fixture");
});

test("public handler blocks cross-origin, private referring paths and forged conversions", async () => {
  const {store,rows} = fakeStorage();
  const runtime = {store,config:server(),campaigns:[]};
  const choice = {act:"choice",analytics:true,marketing:true};
  assert.equal((await publicMeasurement(request(choice,"https://preview.workers.dev"),runtime)).status,403);
  assert.equal((await publicMeasurement(request(choice,PUBLIC_ORIGIN,"",PUBLIC_ORIGIN+"/planos-piloto"),runtime)).status,403);
  assert.equal((await publicMeasurement(request(choice),{...runtime,config:{enabled:false,pixel:false}})).status,404);
  assert.equal(rows.size,0);
  const accepted=await publicMeasurement(request(choice),runtime);
  const raw=accepted.headers.get("set-cookie").split(";")[0];
  assert.match(accepted.headers.get("set-cookie"),/HttpOnly; Secure; SameSite=Strict/);
  for (const stage of ["purchase_confirmed","checkout_started","lead_registered","demo_progress"]) {
    const events=await publicMeasurement(request({act:"event",stage,id:crypto.randomUUID()},PUBLIC_ORIGIN,raw),runtime);
    assert.equal((await events.json()).status,"suppressed");
  }
  assert.equal(rows.size,1);
  const malformed=await publicMeasurement(request({act:"event",stage:"page_view",id:crypto.randomUUID(),email:"secret@example.test"},PUBLIC_ORIGIN,raw),runtime);
  assert.equal(malformed.status,400);
});

test("refusal and revoke block both advertising transports, including an old browser session", async () => {
  const {store,rows} = fakeStorage();
  const calls=[];
  const runtime={store,config:server(calls),campaigns:[]};
  const grant=await publicMeasurement(request({act:"choice",analytics:true,marketing:true}),runtime);
  const cookie=grant.headers.get("set-cookie").split(";")[0];
  const oldId=await digest(cookie.split("=")[1]);
  const decline=await publicMeasurement(request({act:"choice",analytics:false,marketing:false},PUBLIC_ORIGIN,cookie),runtime);
  for (const value of [oldId,await digest(decline.headers.get("set-cookie").split(";")[0].split("=")[1])]) {
    const result=await recordBrowser(store,runtime.config,{journey:value,eventId:crypto.randomUUID(),stage:"page_view",at:Date.now(),attribution:attr},match);
    assert.equal(result.status,"suppressed");
    assert.equal(result.pixel,undefined);
  }
  assert.equal(calls.length,0);
  assert.equal([...rows.keys()].filter(key=>key.includes("/funnel/")).length,0);
});

test("analytics-only stores first-party event and omits both Pixel and CAPI", async () => {
  const {store}=fakeStorage();
  const calls=[];
  await consent(store,true,false);
  const result=await recordBrowser(store,server(calls),{journey:session,eventId:crypto.randomUUID(),stage:"view_content",at:Date.now(),attribution:attr},match);
  assert.equal(result.status,"saved");
  assert.equal(result.delivery,"suppressed");
  assert.equal(result.pixel,undefined);
  assert.deepEqual(calls,[]);
  assert.equal((await readSnapshot(store)).events.length,1);
});

test("simultaneous same event yields one send and matches Pixel and CAPI name and event ID", async () => {
  const {store}=fakeStorage();
  await consent(store);
  const calls=[];
  const input={journey:session,eventId:crypto.randomUUID(),stage:"page_view",at:Date.now(),attribution:attr};
  const results=await Promise.all(Array.from({length:4},()=>recordBrowser(store,server(calls),input,match)));
  assert.equal(calls.length,1);
  const pixel=results.find(result=>result.pixel).pixel;
  assert.equal(pixel.eventId,calls[0].eventId);
  assert.equal(pixel.name,calls[0].name);
  assert.equal((await readSnapshot(store)).duplicates.length,1);
});

test("repeat click measures once per committed commercial attempt, and a missing order yields no event", async () => {
  const {store}=fakeStorage();
  await consent(store);
  const calls=[];
  const config=server(calls);
  const now=Date.now()-50;
  const order={id:crypto.randomUUID(),attemptId:crypto.randomUUID(),journey:session,attribution:attr,openedAt:now,
    source:"commercial",plan:"entrada-essencial",amountCents:12700,currency:"BRL",
    payment:{state:"pending",verifiedAt:null,paidCents:null,currency:null}};
  assert.equal((await measureCheckout(store,config,"opened",async()=>null,match)).status,"suppressed");
  assert.equal((await measureCheckout(store,config,"opened",async()=>({...order,openedAt:null}),match)).status,"suppressed");
  await Promise.all([1,2,3].map(()=>measureCheckout(store,config,"opened",async()=>order,match)));
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,"InitiateCheckout");
  assert.equal((await measureCheckout(store,config,"payment",async()=>order,match)).status,"suppressed");
  for (const source of ["pilot","demo","gmail"]) assert.equal((await measureCheckout(store,config,"opened",async()=>({...order,source}),match)).status,"suppressed");
  assert.equal(calls.length,1);
});

test("pending Pix and mismatched payments do not convert; repeated verified webhook uses order ID and canonical BRL", async () => {
  const {store}=fakeStorage();
  await consent(store);
  const calls=[];
  const config=server(calls);
  const now=Date.now();
  const order={id:crypto.randomUUID(),attemptId:crypto.randomUUID(),journey:session,attribution:attr,openedAt:now-30,
    source:"commercial",plan:"entrada-essencial",amountCents:12700,currency:"BRL",
    payment:{state:"paid",verifiedAt:now,paidCents:12700,currency:"BRL"}};
  for (const payment of [{...order.payment,state:"pending"},{...order.payment,paidCents:500},{...order.payment,currency:"USD"},{...order.payment,verifiedAt:null}]) {
    assert.equal((await measureCheckout(store,config,"payment",async()=>({...order,payment}),match)).status,"suppressed");
  }
  for (const source of ["pilot","demo","gmail"]) assert.equal((await measureCheckout(store,config,"payment",async()=>({...order,source}),match)).status,"suppressed");
  await Promise.all([1,2,3].map(()=>measureCheckout(store,config,"payment",async()=>({...order,attemptId:crypto.randomUUID()}),match)));
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,"Purchase");
  assert.equal(calls[0].amountCents,12700);
  assert.equal(calls[0].currency,"BRL");
  assert.equal(calls[0].eventId,await digest("canonical|purchase_confirmed|"+order.id));
});

test("only persisted lead and consent at fact time qualify", async () => {
  const {store}=fakeStorage();
  const calls=[];
  await consent(store);
  const fact={factId:crypto.randomUUID(),journey:session,at:Date.now(),environment:"commercial",attribution:attr,kind:"lead",registered:false};
  assert.equal((await recordConversion(store,server(calls),async()=>fact,match)).status,"suppressed");
  assert.equal((await recordConversion(store,server(calls),async()=>({...fact,registered:true,at:fact.at-10000}),match)).status,"suppressed");
  assert.equal((await recordConversion(store,server(calls),async()=>({...fact,registered:true}),match)).status,"saved");
  assert.equal(calls[0].name,"Lead");
});

test("transient dispatch failure is recorded as uncertain and never replayed automatically", async () => {
  const {store}=fakeStorage();
  await consent(store);
  let attempted=0;
  const config={enabled:true,pixel:false,async dispatch(){attempted++;throw Error("private reply");}};
  const event={journey:session,eventId:crypto.randomUUID(),stage:"page_view",at:Date.now(),attribution:attr};
  assert.equal((await recordBrowser(store,config,event,match)).delivery,"uncertain");
  assert.equal((await recordBrowser(store,config,event,match)).status,"duplicate");
  assert.equal(attempted,1);
  assert.equal((await readSnapshot(store)).delivery[0].state,"uncertain");
});

test("Meta transport has pinned route, sanitized payload and verifies acceptance via receipt", async () => {
  const event={name:"Purchase",eventId:session,at:1_760_000_000_000,sourceUrl:channel,amountCents:12700,currency:"BRL"};
  let response=Response.json({events_received:1});
  let body;
  const send=metaDispatch("v25.0","fixture-only",async (url,init)=>{
    assert.equal(new URL(url).hostname,"graph.facebook.com");
    assert.equal(new URL(url).search,"");
    assert.equal(init.redirect,"error");
    body=JSON.parse(init.body);
    return response;
  });
  assert.equal(await send(event,match),"accepted");
  assert.deepEqual(body.data[0].custom_data,{currency:"BRL",value:127});
  assert.deepEqual(Object.keys(body.data[0].user_data).sort(),["client_user_agent","fbp"]);
  response=Response.json({events_received:0});
  assert.equal(await send(event,match),"uncertain");
  response=new Response("",{status:400});
  assert.equal(await send(event,match),"rejected");
  assert.equal(await send({...event,sourceUrl:PUBLIC_ORIGIN+"/planos-piloto"},match),"rejected");
});

test("attribution stores only approved labels, never a referring URL or arbitrary query", () => {
  const value=attribution(channel+"?utm_campaign=review-safe&password=private&utm_source=instagram",
    "https://www.google.com/?email=private",["review-safe"]);
  assert.equal(value.source,"meta");
  assert.equal(value.campaign,"review-safe");
  assert.equal(value.landing,PUBLIC_PATH.slice(1));
  assert.equal(attribution(channel+"?utm_campaign=private","",[]).campaign,null);
  assert.equal(PUBLIC_ORIGIN,"https://resolvflow.online");
});

test("usage is daily, deduplicated, allowlisted and pseudonymous", async () => {
  const {store,rows}=fakeStorage();
  const now=Date.now();
  const key="fixture-only-key-not-a-secret".repeat(2);
  const actor="private-actor";
  assert.equal(await recordUsage(store,key,actor,"otp_read",now),false);
  await recordUsage(store,key,actor,"workspace_opened",now);
  await recordUsage(store,key,actor,"workspace_opened",now);
  await recordUsage(store,key,actor,"workspace_opened",now+86_400_000);
  const snapshot=await readSnapshot(store);
  assert.equal(snapshot.usage.length,2);
  assert.notEqual(snapshot.usage[0].subject,snapshot.usage[1].subject);
  assert.ok([...rows].every(row=>!JSON.stringify(row).includes(actor)));
});

test("report shows fixture provenance, period/cohort and diagnostics, and hides rates for partial reads or plan filter", () => {
  const snapshot=fixtureSnapshot();
  const general=report(snapshot,emptyFilters);
  assert.equal(general.mode,"fixture");
  assert.equal(general.denominator,12);
  assert.equal(general.duplicates,1);
  assert.equal(general.rows.find(row=>row.stage==="purchase_confirmed").rate,2/12);
  assert.equal(report(snapshot,{...emptyFilters,source:"meta",stage:"purchase_confirmed"}).denominator,6);
  assert.equal(report(snapshot,{...emptyFilters,plan:"entrada-essencial"}).rows[0].rate,null);
  assert.equal(report({...snapshot,complete:false},emptyFilters).rows[0].rate,null);
  assert.equal(report({...snapshot,mode:"stored",events:[]},emptyFilters).rows.find(row=>row.stage==="purchase_confirmed").events,null);
});
