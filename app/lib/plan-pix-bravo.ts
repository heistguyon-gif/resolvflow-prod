const EYT_HOST = "https://api.eyt.lat";

type PixEnv = {
  EYT_CLIENT_ID?: string;
  EYT_PLATFORM_CLIENT_ID?: string;
  EYT_API_KEY?: string;
  BRAVOPAY_API_KEY?: string;
};

async function parseJsonResponse(response: Response) {
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => {});
    return { ok: false as const, status: response.status, payload: { error: "provider_redirect", status: response.status } };
  }
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    payload = { message: text.slice(0, 240) };
  }
  return { ok: response.ok, status: response.status, payload };
}

async function eytFetch(env: PixEnv, path: string, init: RequestInit = {}) {
  const clientId = (env.EYT_CLIENT_ID || env.EYT_PLATFORM_CLIENT_ID || "").trim();
  const apiKey = env.EYT_API_KEY?.trim();
  if (!clientId || !apiKey) return Response.json({ error: "eyt_unconfigured" }, { status: 503 });
  const response = await fetch(`${EYT_HOST}${path}`, {
    ...init,
    redirect: "manual",
    headers: {
      "X-Client-Id": clientId,
      "X-API-Key": apiKey,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const parsed = await parseJsonResponse(response);
  return Response.json(parsed.payload, { status: parsed.status, headers: { "cache-control": "private, no-store" } });
}

function mapStatus(value: unknown) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "pending" || status === "waiting_payment" || status === "awaiting") return "pending";
  if (status === "paid" || status === "successful" || status === "approved" || status === "completed") return "paid";
  if (status === "expired") return "expired";
  if (status === "failed" || status === "failure" || status === "canceled" || status === "cancelled") return "failed";
  if (status === "refunded") return "refunded";
  if (status === "chargeback") return "chargeback";
  return "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function copyPasteFrom(data: Record<string, unknown>) {
  const pix = asRecord(data.pix);
  const candidates = [
    data.brcode,
    pix.brcode,
    pix.qrcode,
    data.qrcode,
    pix.copy_paste,
    data.copy_paste,
    pix.qr_code,
    data.pix_copy_paste,
    data.pix_qr_code,
  ];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (!value) continue;
    if (value.startsWith("data:image")) continue;
    if (value.startsWith("000201") || value.includes("br.gov.bcb.pix")) return value;
    if (!value.startsWith("iVBOR") && value.length >= 20 && !value.includes("base64,")) return value;
  }
  return "";
}

function expiresFrom(data: Record<string, unknown>) {
  const pix = asRecord(data.pix);
  return String(pix.expiresAt || data.expiresAt || pix.expires_at || data.expires_at || "").trim();
}

function transactionData(payload: Record<string, unknown>) {
  const nested = asRecord(payload.data);
  return Object.keys(nested).length ? nested : payload;
}

export const PLAN_PIX_BRAVO_GATE = "rf-plan-pix-bravo-v1";
const INTERNAL_PREFIX = "/__internal/plan-pix-bravo";

function internalPath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === INTERNAL_PREFIX) return "/";
  if (normalized.startsWith(INTERNAL_PREFIX + "/")) return normalized.slice(INTERNAL_PREFIX.length) || "/";
  if (pathname.startsWith("/") && !pathname.startsWith("/__")) return normalized;
  return "";
}

/** Internal-only (service binding). Commercial plan checkout via EYT only. */
export async function handlePlanPixBravoRequest(request: Request, env: PixEnv) {
  const url = new URL(request.url);
  const caller = (request.headers.get("cf-worker") || "").trim();
  const gate = (request.headers.get("x-rf-plan-pix-internal") || "").trim();
  const allowed =
    gate === PLAN_PIX_BRAVO_GATE ||
    caller === "resolvflow-landing-variants-20261118" ||
    url.hostname === "plan-pix-bravo.internal";
  if (!allowed) return Response.json({ error: "not_found" }, { status: 404 });
  const path = internalPath(url.pathname);
  if (!path) return Response.json({ error: "not_found" }, { status: 404 });
  try {
    if (path === "/health" && request.method === "GET") {
      return Response.json({
        ready: Boolean(env.EYT_API_KEY?.trim() && (env.EYT_CLIENT_ID || env.EYT_PLATFORM_CLIENT_ID)?.trim()),
        provider: "eyt",
      });
    }
    if (path === "/transactions" && request.method === "POST") {
      const body = await request.json() as {
        amountCents?: number;
        orderId?: string;
        description?: string;
        customer?: { name?: string; email?: string; document?: string };
        idempotencyKey?: string;
      };
      const amountCents = Number(body.amountCents);
      const orderId = String(body.orderId || "").trim();
      const email = String(body.customer?.email || "").trim().toLowerCase();
      const name = String(body.customer?.name || "").trim();
      const document = String(body.customer?.document || "").replace(/\D/g, "");
      const idempotencyKey = String(body.idempotencyKey || orderId).trim();
      if (!Number.isSafeInteger(amountCents) || amountCents < 500 || !orderId || !email || !name || !idempotencyKey) {
        return Response.json({ error: "invalid_input" }, { status: 400 });
      }
      const documentType = document.length === 14 ? "CNPJ" : "CPF";
      const upstream = await eytFetch(env, "/api/v1/transactions/create", {
        method: "POST",
        headers: { "Idempotency-Key": `tx_${idempotencyKey}`.slice(0, 120) },
        body: JSON.stringify({
          amount: amountCents,
          currency: "BRL",
          paymentMethod: "PIX",
          installments: 1,
          customer: {
            id: orderId.slice(0, 64),
            name: name.slice(0, 80),
            email,
            document: {
              number: document.length === 11 || document.length === 14 ? document : "00000000000",
              type: document.length === 11 || document.length === 14 ? documentType : "CPF",
            },
            externalRef: orderId.slice(0, 120),
          },
          items: [{
            title: String(body.description || "ResolvFlow plano").slice(0, 120),
            unitPrice: amountCents,
            quantity: 1,
            tangible: false,
            externalRef: orderId.slice(0, 64),
          }],
          pix: { expiresInDays: 1 },
          metadata: JSON.stringify({ purpose: "saas_plan", order_id: orderId }),
          traceable: true,
        }),
      });
      const payload = await upstream.json() as Record<string, unknown>;
      if (!upstream.ok) {
        return Response.json({
          error: "provider_unavailable",
          status: upstream.status,
          detail: payload,
          provider: "eyt",
        }, { status: 502 });
      }
      const data = transactionData(payload);
      const copyPaste = copyPasteFrom(data);
      const status = mapStatus(data.status) || (copyPaste ? "pending" : "");
      const id = String(data.id || data.txId || "").trim();
      if (!id || !status || (status === "pending" && !copyPaste)) {
        return Response.json({ error: "unverified_transaction", detail: payload, provider: "eyt" }, { status: 502 });
      }
      const expiresAt = expiresFrom(data) || new Date(Date.now() + 86_400_000).toISOString();
      return Response.json({
        id,
        status,
        amountCents,
        provider: "eyt",
        pix: status === "pending" ? { payload: copyPaste, expires_at: expiresAt } : null,
      });
    }
    if (path.startsWith("/transactions/") && request.method === "GET") {
      const id = decodeURIComponent(path.slice("/transactions/".length));
      if (!id || id.length > 128) return Response.json({ error: "invalid_input" }, { status: 400 });
      const upstream = await eytFetch(env, `/api/Transaction/transactionByTransactionId/${encodeURIComponent(id)}`);
      const payload = await upstream.json() as Record<string, unknown>;
      if (!upstream.ok) {
        return Response.json({ error: "provider_unavailable", status: upstream.status, detail: payload, provider: "eyt" }, { status: 502 });
      }
      const data = transactionData(payload);
      const copyPaste = copyPasteFrom(data);
      const status = mapStatus(data.status);
      const txId = String(data.id || data.txId || id).trim();
      if (!txId || !status) return Response.json({ error: "unverified_transaction", detail: payload, provider: "eyt" }, { status: 502 });
      return Response.json({
        id: txId,
        status,
        amountCents: Number(data.amount) || undefined,
        provider: "eyt",
        pix: status === "pending" && copyPaste
          ? { payload: copyPaste, expires_at: expiresFrom(data) || new Date(Date.now() + 60_000).toISOString() }
          : null,
      });
    }
    return Response.json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    return Response.json({
      error: "provider_unavailable",
      provider: "eyt",
      detail: error instanceof Error ? error.message.slice(0, 180) : "unknown",
    }, { status: 503 });
  }
}
