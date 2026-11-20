// BlackFy PIX gateway (backed by EYT). Docs: https://blackfy.blackfy.workers.dev/docs
export const BLACKFY_DEFAULT_BASE_URL = "https://blackfy.blackfy.workers.dev/v1";
// BLACKFY_API_BASE is operator-controlled (worker var), never request input. Only
// absolute https URLs without credentials/query are accepted; anything else
// falls back to the documented production host.
export function blackfyBaseUrl(value?: string | null) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return BLACKFY_DEFAULT_BASE_URL;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return BLACKFY_DEFAULT_BASE_URL;
    return raw;
  } catch { return BLACKFY_DEFAULT_BASE_URL; }
}
const SIGNATURE_TOLERANCE_SECONDS = 300;

export type BlackfyChargeStatus = "pending" | "paid" | "expired" | "canceled" | "refunded";

export type BlackfyCharge = {
  id: string;
  object: "charge";
  livemode: boolean;
  status: BlackfyChargeStatus | string;
  amount: number;
  refunded_amount?: number;
  currency?: string;
  description?: string | null;
  external_id?: string | null;
  pix?: {
    copy_paste?: string | null;
    qr_code_url?: string | null;
    expires_at?: string | null;
  } | null;
  payment_url?: string | null;
  metadata?: Record<string, string> | null;
  created_at?: string;
  paid_at?: string | null;
};

export type BlackfyWebhookEnvelope = {
  id: string;
  type: string;
  created_at?: string;
  livemode?: boolean;
  data: { object: BlackfyCharge };
};

type FetchLike = typeof fetch;

function safeProviderError(status: number, payload: unknown) {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const nested = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : {};
  const code = String(nested.code || record.code || "").trim();
  const param = String(nested.param || "").trim();
  if (code === "invalid_document") return "CPF ou CNPJ inválido.";
  if (code === "invalid_request" && param === "amount") return "O valor está fora do limite aceito pelo PIX.";
  if (code === "invalid_request" && param.startsWith("customer")) return "Confira os dados do pagador (CPF ou CNPJ).";
  if (code === "limit_exceeded") return "O valor está acima do limite aceito pelo PIX.";
  if (code === "not_found" || status === 404) return "Cobrança PIX não encontrada.";
  if (code === "invalid_api_key" || status === 401) return "A integração PIX não está autorizada.";
  if (status === 403) return "A conta PIX ainda não está ativada para produção.";
  if (code === "rate_limited" || status === 429) return "O PIX está temporariamente ocupado. Aguarde e tente novamente.";
  return "Não foi possível processar esta cobrança PIX.";
}

async function request<T>(apiKey: string, path: string, init: RequestInit = {}, fetchImpl: FetchLike = fetch, baseUrl?: string) {
  if (!apiKey.trim()) throw new Error("Pagamento PIX ainda não está disponível.");
  const response = await fetchImpl(`${blackfyBaseUrl(baseUrl)}${path}`, {
    ...init,
    redirect: "manual",
    credentials: "omit",
    signal: init.signal ?? AbortSignal.timeout(20000),
    headers: {
      authorization: `Bearer ${apiKey.trim()}`,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let payload: unknown = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (!response.ok) throw new Error(safeProviderError(response.status, payload));
  return { response, payload: payload as T };
}

export async function createBlackfyCharge(input: {
  apiKey: string;
  idempotencyKey: string;
  amountCents: number;
  customer: { name: string; email: string; document: string };
  metadata: Record<string, string>;
  callbackUrl?: string;
  expiresInSeconds?: number;
  description?: string;
  fetchImpl?: FetchLike;
  baseUrl?: string;
}) {
  return request<BlackfyCharge>(input.apiKey, "/pix/charges", {
    method: "POST",
    headers: { "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({
      amount: input.amountCents,
      description: (input.description || "Resolvflow créditos").slice(0, 140),
      external_id: input.idempotencyKey,
      expires_in: input.expiresInSeconds ?? 1800,
      customer: input.customer,
      ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
      metadata: input.metadata,
    }),
  }, input.fetchImpl, input.baseUrl);
}

export async function getBlackfyCharge(apiKey: string, chargeId: string, fetchImpl?: FetchLike, baseUrl?: string) {
  const id = String(chargeId || "").trim();
  if (!/^ch_[A-Za-z0-9_-]+$/.test(id)) throw new Error("Cobrança PIX inválida.");
  return request<BlackfyCharge>(apiKey, `/pix/charges/${encodeURIComponent(id)}`, {}, fetchImpl, baseUrl);
}

function parseSignatureHeader(header: string) {
  let timestamp = 0;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [rawKey, ...rest] = part.trim().split("=");
    const value = rest.join("=").trim().toLowerCase();
    if (rawKey.trim() === "t") timestamp = Number(value);
    if (rawKey.trim() === "v1" && /^[a-f0-9]{64}$/.test(value)) signatures.push(value);
  }
  return { timestamp, signatures };
}

function constantTimeEqualHex(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function blackfySignature(secret: string, timestamp: number, rawBody: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  return [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyBlackfyWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string;
  secret: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}) {
  const { timestamp, signatures } = parseSignatureHeader(input.signatureHeader || "");
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS;
  if (!Number.isInteger(timestamp) || timestamp <= 0 || Math.abs(now - timestamp) > tolerance || !signatures.length || !input.secret.trim()) return false;
  const expected = await blackfySignature(input.secret, timestamp, input.rawBody);
  return signatures.some((signature) => constantTimeEqualHex(signature, expected));
}

export function parseBlackfyWebhook(rawBody: string): BlackfyWebhookEnvelope {
  const payload = JSON.parse(rawBody) as Partial<BlackfyWebhookEnvelope>;
  const charge = payload.data?.object;
  if (!payload.id || typeof payload.id !== "string" || !payload.type || typeof payload.type !== "string") throw new Error("Evento PIX inválido.");
  if (payload.type.startsWith("charge.") && (!charge?.id || typeof charge.id !== "string")) throw new Error("Evento PIX inválido.");
  return payload as BlackfyWebhookEnvelope;
}

// Maps BlackFy charge states onto the otp_payments.status vocabulary.
export function blackfyPaymentState(status?: string | null) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "paid") return "paid";
  if (normalized === "expired") return "expired";
  if (normalized === "canceled" || normalized === "cancelled") return "canceled";
  if (normalized === "refunded") return "refunded";
  return "pending";
}
