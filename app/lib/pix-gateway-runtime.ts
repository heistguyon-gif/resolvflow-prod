import { env } from "cloudflare:workers";
import { getMediaBucket } from "./media-storage";
import { encryptToken, decryptToken } from "./token-crypto";
import { runtimeEnv } from "./runtime-env";
import { createPixGatewayRegistry, type PixProvider } from "./pix-gateway-config";
import { createPixGatewayAdapters } from "./pix-gateway-adapters";
import { createPixGatewayPayments } from "./pix-gateway-payments";

export function pixGatewayRuntime(actorId = "system") {
  const bucket=getMediaBucket(),codec={encrypt:encryptToken,decrypt:decryptToken};
  const values=runtimeEnv();
  async function legacyKey(provider:PixProvider){
    if(provider==="leztypay")return values.LEZTYPAY_API_KEY?.trim()||"";
    // BlackFy keys (bp_live_sk_…) look like BravoPay keys (bp_live_…). BlackFy is
    // selected only through its own BLACKFY_API_KEY; the same credential is never
    // treated as a BravoPay key, whatever field it was stored in.
    const blackfyKey=values.BLACKFY_API_KEY?.trim()||"";
    const notBlackfy=(key:string)=>key&&key!==blackfyKey?key:"";
    const key=notBlackfy((values.BRAVOPAY_API_KEY||values.MERCADO_PAGO_ACCESS_TOKEN||"").trim());if(key)return key;
    const row=await env.DB.prepare("SELECT mercado_pago_ciphertext c,mercado_pago_iv iv FROM otp_settings WHERE id='default' LIMIT 1").first<{c:string;iv:string}>();
    return row?.c&&row.iv?notBlackfy((await decryptToken(row.c,row.iv)).trim()):"";
  }
  const registry=createPixGatewayRegistry(bucket,codec,async entry=>{
    await env.DB.prepare("INSERT INTO audit_events(id,owner_user_id,actor_user_id,actor_email,action,entity_type,entity_id,summary,metadata_json) VALUES(?,?,?,?,?,'pix_gateway',?,'Configuração Pix alterada',?) ON CONFLICT(id) DO NOTHING")
      .bind(`pix-config:${entry.requestId}`,actorId,actorId,entry.actor,`pix.gateway.${entry.action}`,entry.configId,JSON.stringify({version:entry.version,requestId:entry.requestId})).run();
  },async()=>[
    {provider:"leztypay",hasApiKey:Boolean(values.LEZTYPAY_API_KEY?.trim()),hasWebhookSecret:Boolean(values.LEZTYPAY_WEBHOOK_SECRET?.trim())},
    {provider:"bravopay",hasApiKey:Boolean(await legacyKey("bravopay")),hasWebhookSecret:false},
    {provider:"blackfy",hasApiKey:Boolean(values.BLACKFY_API_KEY?.trim()),hasWebhookSecret:Boolean(values.BLACKFY_WEBHOOK_SECRET?.trim())},
  ],Date.now,legacyKey, async configId => Boolean(await env.DB
    .prepare("SELECT 1 AS found FROM otp_payments WHERE provider GLOB ? LIMIT 1")
    .bind("pixcfg:" + configId + ":*").first()));
  return {registry,payments:createPixGatewayPayments(env.DB,bucket,codec,registry,createPixGatewayAdapters())};
}
