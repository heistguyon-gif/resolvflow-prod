export const PUBLIC_ORIGIN = "https://resolvflow.online";
export const PUBLIC_PATH = "/planos";
export const OWNER_SCOPE = "nexoflow:lucasbgn.affiliate@gmail.com";
export const PIXEL_ID = "1125045276738252";
export const CONSENT_VERSION = 1;
export const ID = /^[0-9a-f]{64}$/;
export const PLANS = ["entrada-essencial","entrada-operacao","anual-essencial","anual-operacao","anual-expansao"] as const;
export type Plan = typeof PLANS[number];
export const STAGES = ["page_view","view_content","demo_progress","lead_registered","checkout_started","purchase_confirmed"] as const;
export type Stage = typeof STAGES[number];
export const USAGE = ["signed_in","workspace_opened","campaigns_opened","stories_opened","mail_reader_opened"] as const;
export type Usage = typeof USAGE[number];
export type Choice = {analytics:boolean; marketing:boolean};
export type Consent = Choice & {version:number; savedAt:number; expiresAt:number};
export type Attribution = {source:"meta"|"search"|"partner"|"direct"|"other"; campaign:string|null; landing:"planos"};
export type FunnelEvent = {
  id:string; journey:string; at:number; stage:Stage; analytics:boolean; attribution:Attribution;
  plan?:Plan; amountCents?:number; currency?:"BRL";
};
export type UsageEvent = {id:string; subject:string; at:number; usage:Usage};
export type Delivery = "accepted"|"rejected"|"uncertain"|"suppressed"|"claimed";
export const META_EVENT: Partial<Record<Stage,string>> = {
  page_view:"PageView",view_content:"ViewContent",lead_registered:"Lead",checkout_started:"InitiateCheckout",purchase_confirmed:"Purchase",
};
export async function digest(value:string) {
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
}
export function attribution(raw:string, referrer:string, approvedCampaigns:readonly string[]):Attribution {
  const fallback:Attribution={source:"direct",campaign:null,landing:"planos"};
  try {
    const url=new URL(raw);
    if(url.origin!==PUBLIC_ORIGIN||url.pathname!==PUBLIC_PATH)return fallback;
    const source=url.searchParams.getAll("utm_source");
    const campaign=url.searchParams.getAll("utm_campaign");
    const knownSource:Record<string,Attribution["source"]>={facebook:"meta",instagram:"meta",meta:"meta",google:"search",partner:"partner"};
    if(source.length)fallback.source=source.length===1&&Object.hasOwn(knownSource,source[0])?knownSource[source[0]]:"other";
    else if(referrer){
      const host=new URL(referrer).hostname;
      fallback.source=["facebook.com","www.facebook.com","l.facebook.com","instagram.com","www.instagram.com"].includes(host)?"meta":
        ["www.google.com","www.google.com.br"].includes(host)?"search":new URL(referrer).origin===PUBLIC_ORIGIN?"direct":"other";
    }
    if(campaign.length===1&&/^[a-z0-9][a-z0-9_-]{0,39}$/.test(campaign[0])&&approvedCampaigns.includes(campaign[0]))fallback.campaign=campaign[0];
    return fallback;
  }catch{return fallback;}
}
export function isFreshConsent(consent:Consent|null, now:number) {
  return Boolean(consent?.version===CONSENT_VERSION&&consent.expiresAt>now);
}
export function ownWorkspace(email:string,workspace:string,role:string) {
  return email.trim().toLowerCase()==="lucasbgn.affiliate@gmail.com"&&workspace===OWNER_SCOPE&&role==="owner";
}
