import {CONSENT_VERSION,ID,META_EVENT,OWNER_SCOPE,PLANS,PUBLIC_ORIGIN,PUBLIC_PATH,digest,isFreshConsent,type Attribution,type Choice,type Consent,type Delivery,type FunnelEvent,type Plan,type Stage} from "./model";
import type {MeasurementStore} from "./storage";

const root=OWNER_SCOPE+"/";
const days=30*86_400_000;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export async function saveChoice(store:MeasurementStore,journey:string,choice:Choice,now:number) {
  if(!ID.test(journey))throw Error("invalid_session");
  const consent:Consent={...choice,version:CONSENT_VERSION,savedAt:now,expiresAt:now+days};
  await store.write(root+"consent/"+journey,consent);
}
export async function readChoice(store:MeasurementStore,journey:string,now:number):Promise<Consent|null> {
  if(!ID.test(journey)||await store.get("revoked/"+journey))return null;
  const latest=await store.get(root+"consent/"+journey) as Consent|null;
  return isFreshConsent(latest,now)?latest:null;
}
export type MetaSpec={name:string;eventId:string;at:number;sourceUrl:string;amountCents?:number;currency?:"BRL"};
export type MetaContext={fbp:string; userAgent:string};
export type Dispatch=(event:MetaSpec, context:MetaContext)=>Promise<"accepted"|"rejected"|"uncertain">;
export type CollectionConfig={enabled:boolean;pixel:boolean;dispatch?:Dispatch};
export type CollectionResult={status:"saved"|"duplicate"|"suppressed"|"disabled";pixel?:MetaSpec;delivery?:Delivery};
type PublicInput={id:string;journey:string;at:number;attribution:Attribution;stage:Stage;plan?:Plan;amountCents?:number;currency?:"BRL"};
async function record(store:MeasurementStore,config:CollectionConfig,input:PublicInput,match?:MetaContext):Promise<CollectionResult> {
  if(!config.enabled)return {status:"disabled"};
  const consent=await readChoice(store,input.journey,Date.now());
  if(!consent||input.at<consent.savedAt||(!consent.analytics&&!consent.marketing))return {status:"suppressed"};
  const event:FunnelEvent={...input,analytics:consent.analytics};
  if(!await store.once(root+"funnel/"+input.id,event)){
    await store.once(root+"duplicate/"+input.id,{id:input.id});
    return {status:"duplicate"};
  }
  const name=META_EVENT[input.stage];
  if(!name)return {status:"saved"};
  const spec:MetaSpec={name,eventId:input.id,at:input.at,sourceUrl:PUBLIC_ORIGIN+PUBLIC_PATH,...(input.stage==="purchase_confirmed"?{amountCents:input.amountCents,currency:input.currency}:{})};
  const allowed=async()=>Boolean((await readChoice(store,input.journey,Date.now()))?.marketing);
  let delivery:Delivery="suppressed";
  if(match&&config.dispatch&&await allowed()&&await store.once(root+"delivery/"+input.id,{id:input.id,state:"claimed"})){
    if(await allowed()){
      try{delivery=await config.dispatch(spec,match);}catch{delivery="uncertain";}
    }
    await store.write(root+"delivery/"+input.id,{id:input.id,state:delivery});
  }else await store.once(root+"delivery/"+input.id,{id:input.id,state:delivery});
  return {status:"saved",delivery,...(config.pixel&&await allowed()?{pixel:spec}:{})};
}
export async function recordBrowser(store:MeasurementStore,config:CollectionConfig,input:{journey:string;eventId:string;stage:unknown;at:number;attribution:Attribution},match?:MetaContext) {
  if(!ID.test(input.journey)||!uuid.test(input.eventId)||!(input.stage==="page_view"||input.stage==="view_content"))return {status:"suppressed"} as const;
  const id=await digest("web|"+input.journey+"|"+input.stage+"|"+input.eventId);
  return record(store,config,{id,journey:input.journey,stage:input.stage,at:input.at,attribution:input.attribution},match);
}
export type ConversionFact={
  factId:string;journey:string;at:number;attribution:Attribution;environment:"commercial"|"pilot"|"simulated"|"otp"|"private";
} & ({
  kind:"lead"; registered:boolean;
}|{
  kind:"order"; state:"started";plan:Plan;
}|{
  kind:"order"; state:"confirmed";plan:Plan;amountCents:number;currency:string;
});
// Intended only for an authenticated server producer reading canonical records by ID.
export async function recordConversion(store:MeasurementStore,config:CollectionConfig,load:()=>Promise<ConversionFact|null>,match?:MetaContext) {
  if(!config.enabled)return {status:"disabled"} as const;
  const fact=await load();
  if(!fact||fact.environment!=="commercial"||!ID.test(fact.journey)||!uuid.test(fact.factId)||!Number.isSafeInteger(fact.at)||fact.at<=0||fact.at>Date.now()||
    !(fact.kind==="lead"||fact.kind==="order"&&(fact.state==="started"||fact.state==="confirmed")))return {status:"suppressed"} as const;
  const stage:Stage=fact.kind==="lead"?"lead_registered":fact.state==="started"?"checkout_started":"purchase_confirmed";
  if(fact.kind==="lead"?!fact.registered:!PLANS.includes(fact.plan))return {status:"suppressed"} as const;
  if(fact.kind==="order"&&fact.state==="confirmed"&&(fact.currency!=="BRL"||!Number.isSafeInteger(fact.amountCents)||fact.amountCents<=0))return {status:"suppressed"} as const;
  const id=await digest("canonical|"+stage+"|"+fact.factId);
  return record(store,config,{id,journey:fact.journey,stage,at:fact.at,attribution:fact.attribution,...(fact.kind==="order"?{plan:fact.plan}:{}),
    ...(fact.kind==="order"&&fact.state==="confirmed"?{amountCents:fact.amountCents,currency:"BRL" as const}:{})},match);
}
