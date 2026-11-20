import { runtimeEnv } from "./runtime-env";

const HOST = "https://otpgmail.net/v1";
const PREFIX = "og_";
const STOCK_CODES = new Set(["OUT_OF_STOCK", "WAREHOUSE_UNAVAILABLE", "NO_MAILS_AVAILABLE", "ALL_WAREHOUSES_EXHAUSTED"]);

type Result = { success?: boolean; data?: unknown; error?: { code?: string; message?: string }; partial?: {requested?: number;delivered?: number;missing?: number;reason?: {code?: string;message?: string}} };
type Order = { orderId?: string; email?: string; status?: string; otp?: Array<{ code?: string }> };

export function isOtpGmailOrderId(orderId: string) { return orderId.startsWith(PREFIX); }
export function isOtpGmailStockFailure(status: number, data: unknown) {
  const result = data && typeof data === "object" ? data as Result : {};
  const detail = (result as Result & { detail?: unknown }).detail;
  const nested = detail && typeof detail === "object" ? detail as Result : {};
  const code = String(result.error?.code || nested.error?.code || "").toUpperCase();
  const message = String(result.error?.message || nested.error?.message || (typeof detail === "string" ? detail : ""));
  return STOCK_CODES.has(code) || code.includes("OUT_OF_STOCK") || status === 409 && /stock|estoque|warehouse|mail.*available/i.test(message);
}

export function otpGmailKey() { return runtimeEnv().OTPGMAIL_API_KEY?.trim() || ""; }

export type OtpGmailStock = { total: number; warehouse2: number; checkedAt: string };
let stockCache: { expiresAt: number; value: OtpGmailStock } | null = null;
let stockRequest: Promise<OtpGmailStock> | null = null;

export async function otpGmailStock(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<OtpGmailStock> {
  if (stockCache && stockCache.expiresAt > Date.now()) return stockCache.value;
  if (stockRequest) return stockRequest;
  stockRequest = (async () => {
    const { response, data } = await otpGmailFetch(apiKey, "/services", {}, fetchImpl);
    if (!response.ok || !data.success || !Array.isArray(data.data)) throw new Error("Estoque indisponível.");
    const instagram = (data.data as Array<{ code?: string; offers?: Array<{ warehouse?: number; domain?: string; stock?: number }> }>).find((item) => item.code === "ig");
    if (!instagram) throw new Error("Estoque indisponível.");
    const offers = Array.isArray(instagram.offers) ? instagram.offers.filter((item) => item.domain === "gmail.com") : [];
    const available = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    const value = {
      total: offers.reduce((sum, item) => sum + available(item.stock), 0),
      warehouse2: offers.filter((item) => item.warehouse === 2).reduce((sum, item) => sum + available(item.stock), 0),
      checkedAt: new Date().toISOString(),
    };
    stockCache = { expiresAt: Date.now() + 30_000, value };
    return value;
  })();
  try { return await stockRequest; }
  finally { stockRequest = null; }
}

export async function otpGmailBalance(apiKey: string, fetchImpl: typeof fetch = fetch) {
  const { response, data } = await otpGmailFetch(apiKey, "/balance", {}, fetchImpl);
  const balance = data.data && !Array.isArray(data.data) && typeof data.data === "object"
    ? (data.data as { balance?: unknown }).balance : null;
  if (!response.ok || !data.success || typeof balance !== "number" || !Number.isFinite(balance)) throw new Error("Saldo indisponível.");
  return { balance, currency: "VND", checkedAt: new Date().toISOString() };
}

export async function otpGmailFetch(apiKey: string, path: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  headers.set("X-Lang", "en");
  headers.set("Accept", "application/json");
  const response = await fetchImpl(`${HOST}${path}`, { ...init, headers, signal: init.signal || AbortSignal.timeout(20_000) });
  const raw = await response.text();
  let data: Result;
  try { data = JSON.parse(raw) as Result; }
  catch { data = { success: false, error: { code: "INVALID_RESPONSE" } }; }
  return { response, data };
}

export async function requestOtpGmailOrder(apiKey: string, warehouse: 2 | 99, fetchImpl: typeof fetch = fetch, idempotencyKey = crypto.randomUUID()) {
  const { response, data } = await otpGmailFetch(apiKey, "/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    signal: AbortSignal.timeout(warehouse === 99 ? 65_000 : 25_000),
    body: JSON.stringify({ service: "ig", domain: "gmail.com", warehouse, quantity: 1 }),
  }, fetchImpl);
  if (!response.ok || !data.success) return { order: null, failure: { status: response.status, data } };
  // The documented partial response can deliver zero of the single requested
  // inbox. Only an explicit stock reason and consistent counts prove no delivery.
  const partial=data.partial;
  const allocationFields=["orderId","order_id","email","order","orders"];
  const hasAllocation=allocationFields.some(key=>Object.hasOwn(data,key)||partial&&Object.hasOwn(partial,key)||partial?.reason&&Object.hasOwn(partial.reason,key));
  if(data.success===true&&!hasAllocation&&Array.isArray(data.data)&&data.data.length===0&&partial?.requested===1&&partial.delivered===0&&partial.missing===1&&STOCK_CODES.has(String(partial.reason?.code||""))) {
    return {order:null,failure:{status:409,data:{success:false,error:partial.reason}}};
  }
  const order = Array.isArray(data.data) ? data.data[0] as Order | undefined : undefined;
  if (!order?.orderId || !order.email || !/^[A-Za-z0-9_-]{1,61}$/.test(order.orderId)) {
    return { order: null, failure: { status: 502, data: { error: { code: "INVALID_RESPONSE" } } } };
  }
  return { order: { order_id: `${PREFIX}${order.orderId}`, email: order.email, status: order.status || "active" }, failure: null };
}

export async function otpGmailCode(apiKey: string, orderId: string, fetchImpl: typeof fetch = fetch) {
  const providerId = orderId.slice(PREFIX.length);
  const { response, data } = await otpGmailFetch(apiKey, `/orders/${encodeURIComponent(providerId)}`, {}, fetchImpl);
  const order = data.data && !Array.isArray(data.data) ? data.data as Order : null;
  const code = Array.isArray(order?.otp) ? order.otp.at(-1)?.code || null : null;
  return { response, data: response.ok && data.success ? { status: code ? "ready" : order?.status === "cancelled" ? "closed" : "pending", code } : data };
}

function otpGmailErrorCode(data: Result) {
  const detail = (data as Result & { detail?: unknown }).detail;
  const nested = detail && typeof detail === "object" ? detail as Result : {};
  return String(data.error?.code || nested.error?.code || "").toUpperCase();
}

function latestOtpCode(order: Order | null) {
  if (!Array.isArray(order?.otp)) return "";
  return order.otp.map((item) => String(item?.code || "").trim()).filter(Boolean).at(-1) || "";
}

export async function cancelOtpGmailOrder(apiKey: string, orderId: string, fetchImpl: typeof fetch = fetch) {
  const providerId = orderId.startsWith(PREFIX) ? orderId.slice(PREFIX.length) : orderId;
  if (!/^[A-Za-z0-9_-]{1,61}$/.test(providerId)) return { outcome: "rejected" as const, errorCode: "INVALID_ORDER", status: 400 };
  const { response, data } = await otpGmailFetch(apiKey, `/orders/${encodeURIComponent(providerId)}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  }, fetchImpl);
  const order = data.data && !Array.isArray(data.data) ? data.data as Order : null;
  const code = latestOtpCode(order);
  if (code) return { outcome: "has_code" as const, code };
  if (response.ok && data.success && String(order?.status || "").toLowerCase() === "cancelled") return { outcome: "cancelled" as const };
  return { outcome: "rejected" as const, errorCode: otpGmailErrorCode(data) || "PROVIDER_ERROR", status: response.status };
}
