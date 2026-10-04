const LEZTYPAY_BASE_URL = "https://api.leztypay.com";
const SIGNATURE_TOLERANCE_SECONDS = 300;

export type LeztyTransaction = {
  id: string;
  object: "transaction";
  mode: "live" | "test";
  status: string;
  payment_method: string;
  amount: number;
  pix: {
    payload: string | null;
    qr_base64: string | null;
    expires_at: string;
  };
  paid_at?: string | null;
  expired_at?: string | null;
};

export type LeztyWebhookEnvelope = {
  id: string;
  object: "event";
  type: string;
  mode: "live" | "test";
  created_at: string;
  data: { object: LeztyTransaction };
};

type FetchLike = typeof fetch;

function safeProviderError(status: number, payload: unknown) {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const nested = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : {};
  const code = String(nested.code || record.code || "").trim();
  if (code === "invalid_document") return "CPF ou CNPJ inválido.";
  if (code === "amount_too_small") return "O valor está abaixo do mínimo aceito pelo PIX.";
  if (code === "amount_too_large") return "O valor está acima do limite aceito pelo PIX.";
  if (status === 401 || status === 403) return "A integração PIX não está autorizada.";
  if (status === 429) return "O PIX está temporariamente ocupado. Aguarde e tente novamente.";
  return "A Lezty Pay não conseguiu processar esta cobrança.";
}

async function request<T>(apiKey: string, path: string, init: RequestInit = {}, fetchImpl: FetchLike = fetch) {
  if (!apiKey.trim()) throw new Error("Pagamento PIX ainda não está disponível.");
  const response = await fetchImpl(`${LEZTYPAY_BASE_URL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
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

export async function createLeztyPixTransaction(input: {
  apiKey: string;
  idempotencyKey: string;
  amountCents: number;
  customer: { name: string; email: string; document: string };
  metadata: Record<string, string>;
  postbackUrl?: string;
  fetchImpl?: FetchLike;
}) {
  return request<LeztyTransaction>(input.apiKey, "/v1/transactions", {
    method: "POST",
    headers: { "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({
      amount: input.amountCents,
      payment_method: "pix",
      customer: input.customer,
      items: [{ name: "Créditos Resolvflow", quantity: 1, unit_amount: input.amountCents }],
      pix: { expires_in_seconds: 1800 },
      ...(input.postbackUrl ? { postback_url: input.postbackUrl } : {}),
      metadata: input.metadata,
      description: "Resolvflow créditos",
    }),
  }, input.fetchImpl);
}

export async function getLeztyTransaction(apiKey: string, transactionId: string, fetchImpl?: FetchLike) {
  const id = String(transactionId || "").trim();
  if (!id) throw new Error("Cobrança PIX inválida.");
  return request<LeztyTransaction>(apiKey, `/v1/transactions/${encodeURIComponent(id)}`, {}, fetchImpl);
}

function parseSignatureHeader(header: string) {
  let timestamp = 0;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [rawKey, ...rest] = part.trim().split("=");
    const value = rest.join("=").trim();
    if (rawKey === "t") timestamp = Number(value);
    if (rawKey === "v1" && /^[a-f0-9]{64}$/.test(value)) signatures.push(value);
  }
  return { timestamp, signatures };
}

function constantTimeEqualHex(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function verifyLeztyWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string;
  secret: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}) {
  const { timestamp, signatures } = parseSignatureHeader(input.signatureHeader);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS;
  if (!Number.isInteger(timestamp) || timestamp <= 0 || Math.abs(now - timestamp) > tolerance || !signatures.length || !input.secret.trim()) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(input.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${input.rawBody}`));
  const expected = [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return signatures.some((signature) => constantTimeEqualHex(signature, expected));
}

export function parseLeztyWebhook(rawBody: string): LeztyWebhookEnvelope {
  const payload = JSON.parse(rawBody) as Partial<LeztyWebhookEnvelope>;
  const transaction = payload.data?.object;
  if (!payload.id || payload.object !== "event" || !payload.type || !transaction?.id || transaction.object !== "transaction") {
    throw new Error("Evento PIX inválido.");
  }
  return payload as LeztyWebhookEnvelope;
}

export function leztyPaymentState(status?: string | null) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "paid") return "paid";
  if (normalized === "expired") return "expired";
  if (["failed", "refunded", "chargeback"].includes(normalized)) return normalized;
  return "pending";
}
