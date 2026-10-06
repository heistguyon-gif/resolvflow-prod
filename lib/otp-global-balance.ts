import { getInstacasterApiKey } from "./otp-billing";
import { otpProviderFetch } from "./otp-provider";
import { parseGlobalOtpBalance, type GlobalOtpBalance } from "./otp-balance-result";

const CACHE_MS = 30_000;
let cached: { key: string; expiresAt: number; result: GlobalOtpBalance } | null = null;
let pending: { key: string; result: Promise<GlobalOtpBalance> } | null = null;

async function fetchBalance(key: string): Promise<GlobalOtpBalance> {
  const checkedAt = new Date().toISOString();
  try {
    const limitedFetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(5_000) })) as typeof fetch;
    const { response, data } = await otpProviderFetch(key, "/v1/balance", "GET", undefined, limitedFetch);
    return parseGlobalOtpBalance(response.status, data, checkedAt);
  } catch {
    return { state: "unavailable", checkedAt };
  }
}

export async function getGlobalOtpBalance(refresh = false): Promise<GlobalOtpBalance> {
  let key: string;
  try { key = await getInstacasterApiKey(); }
  catch { return { state: "unavailable", checkedAt: new Date().toISOString() }; }
  if (!key) return { state: "unconfigured" };
  if (!refresh && cached?.key === key && cached.expiresAt > Date.now()) return cached.result;
  if (pending?.key === key) return pending.result;
  const request = fetchBalance(key).then((result) => {
    cached = { key, expiresAt: Date.now() + CACHE_MS, result };
    return result;
  }).finally(() => { if (pending?.result === request) pending = null; });
  pending = { key, result: request };
  return request;
}
