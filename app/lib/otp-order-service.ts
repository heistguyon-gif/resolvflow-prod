import { OtpOrderStore } from "./otp-order-store";
import { otpHash } from "./otp-provider-coordinator";
import type { OtpProviderResponse } from "./otp-provider";

type ProviderOrder = {order_id:string;email:string;status?:string;price?:string};
export type OtpPurchaseProviders = {
  primaryKey:string; fallbackKey:string;
  primary:(key:string)=>Promise<OtpProviderResponse>;
  fallback:(key:string,warehouse:2|99,idempotencyKey:string)=>Promise<{order:ProviderOrder|null;failure:{status:number;data:unknown}|null}>;
  stockFailure:(status:number,data:unknown)=>boolean;
};
function codeOf(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as {error?:{code?:string};code?:string};
  return String(record.error?.code || record.code || "").toLowerCase();
}

/** One supplier allocation per request keeps a 13-item operation recoverable. */
export async function continueOtpPurchase(store: OtpOrderStore,id:string,actor:string,providers:OtpPurchaseProviders) {
  const token = await store.acquire(id,actor);
  if (!token) return store.publicStatus(id,actor);
  try {
    const items = await store.items(id);
    for (const item of items) {
      if (item.status !== "pending" && item.status !== "uncertain") continue;
      if (item.status === "uncertain" && (item.provider !== "otpgmail" || item.attempt_count>=3 || !item.started_at || Date.now()-item.started_at > 23*3_600_000)) continue;
      const key = item.provider === "otpgmail" ? providers.fallbackKey : providers.primaryKey;
      if (!key) {
        if (item.status === "uncertain") {await store.uncertain(item.id,"credentials_changed");continue;}
        await store.fail(item.id,"unavailable");
        continue;
      }
      const keyHash = await otpHash(`${item.provider}:${key}`);
      if (item.status === "uncertain" && item.provider_key_hash !== keyHash) { await store.uncertain(item.id,"credentials_changed");continue; }
      await store.renew(id,token);
      await store.begin(item,keyHash);
      let failure: {status:number;data:unknown}|null = null;
      try {
        if (item.provider === "instacaster") {
          const result = await providers.primary(key);
          const data = result.data as Partial<ProviderOrder> | null;
          if (result.response.ok && typeof data?.order_id==="string" && /^[A-Za-z0-9_-]{6,64}$/.test(data.order_id) && typeof data.email==="string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
            await store.delivered(item.id,{orderId:data.order_id,email:data.email,status:data.status || "active",price:data.price});
          } else failure = {status:result.response.status,data:result.data};
        } else {
          const result = await providers.fallback(key,item.warehouse,item.idempotency_key);
          if (result.order) await store.delivered(item.id,{orderId:result.order.order_id,email:result.order.email,status:result.order.status || "active"});
          else failure = result.failure || {status:502,data:{}};
        }
        if (failure) {
          const code = codeOf(failure.data);
          if (providers.stockFailure(failure.status,failure.data)) {
            if (item.provider === "instacaster" && providers.fallbackKey) await store.fallback(item.id);
            else if (item.provider === "otpgmail" && item.warehouse === 2) await store.warehouse99(item.id);
            else await store.fail(item.id,"out_of_stock");
          } else if ([400,401,402,403,404,422,429].includes(failure.status) || item.provider === "instacaster" && failure.status === 502 && code === "service_error") {
            await store.fail(item.id,failure.status === 429 ? "rate_limited" : "unavailable");
          } else await store.uncertain(item.id,"confirmation_pending");
        }
      } catch {
        await store.uncertain(item.id,"confirmation_pending");
      }
      break;
    }
  } finally { await store.finish(id,token); }
  return store.publicStatus(id,actor);
}
