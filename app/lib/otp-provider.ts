const OTP_HOST = "https://instacaster.top";

export type OtpProviderResponse = {
  response: Response;
  data: unknown;
};

export async function otpProviderFetch(
  apiKey: string,
  path: string,
  method: string,
  body?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OtpProviderResponse> {
  const response = await fetchImpl(`${OTP_HOST}${path}`, {
    method,
    // New paid orders need durable reconciliation before they can time out safely.
    signal: ["GET", "HEAD"].includes(method) ? AbortSignal.timeout(20_000) : undefined,
    headers: {
      "X-API-Key": apiKey,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body,
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text.slice(0, 180) };
  }
  return { response, data };
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}

export async function requestOrdersForApi(input: {
  apiKey: string;
  product: string;
  priorityMode: number;
  quantity: number;
  onOrder: (record: Record<string, unknown>) => Promise<void>;
  fetchImpl?: typeof fetch;
  wait?: (ms: number) => Promise<unknown>;
}) {
  const body = JSON.stringify({ product: input.product, priority_mode: input.priorityMode });
  const wait = input.wait || ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const orders: Array<Record<string, unknown>> = [];
  let lastFailure: { status: number; data: unknown } | null = null;
  for (let index = 0; index < input.quantity; index += 1) {
    let placed = false;
    for (let attempt = 0; attempt < 3 && !placed; attempt += 1) {
      const { response, data } = await otpProviderFetch(input.apiKey, "/v1/orders", "POST", body, input.fetchImpl);
      if (response.status === 429) {
        lastFailure = { status: response.status, data };
        if (attempt < 2) {
          const retryAfter = response.headers.get("retry-after");
          const seconds = retryAfter === null ? NaN : Number(retryAfter);
          const retryAt = retryAfter ? Date.parse(retryAfter) : NaN;
          const delay = Number.isFinite(seconds) ? seconds * 1_000 : Number.isFinite(retryAt) ? retryAt - Date.now() : 700 * (attempt + 1);
          // A longer provider cooldown should be retried by the caller later.
          if (delay > 5_000) break;
          await wait(Math.max(0, delay));
        }
        continue;
      }
      if (!response.ok) {
        lastFailure = { status: response.status, data };
        break;
      }
      const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
      if (record.order_id && record.email) {
        await input.onOrder(record);
        orders.push(record);
        lastFailure = null;
      } else {
        lastFailure = { status: 502, data: { error: "O fornecedor não confirmou o e-mail deste pedido." } };
        break;
      }
      placed = true;
    }
    if (!placed) break;
  }
  return { orders, lastFailure, partial: orders.length < input.quantity };
}

export type OriginBoundOrder = {
  order_id: string;
  supplierApiId: string | null;
};

export async function fetchCodesByOrigin<T extends OriginBoundOrder>(input: {
  orders: T[];
  concurrency: number;
  resolveApiKey: (supplierApiId: string | null, order: T) => Promise<string | null>;
  fetchCode: (apiKey: string, orderId: string, order: T) => Promise<OtpProviderResponse>;
}) {
  return mapWithConcurrency(input.orders, input.concurrency, async (order) => {
    const apiKey = await input.resolveApiKey(order.supplierApiId, order);
    if (!apiKey) return { order, apiKeyFound: false as const, response: null, data: null, error: null };
    try {
      const result = await input.fetchCode(apiKey, order.order_id, order);
      return { order, apiKeyFound: true as const, response: result.response, data: result.data, error: null };
    } catch (error) {
      return { order, apiKeyFound: true as const, response: null, data: null, error };
    }
  });
}
