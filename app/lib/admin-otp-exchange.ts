type Quote = { vndPerUsd: number; updatedAt: string };
let cached: { quote: Quote; until: number } | undefined;
let pending: Promise<Quote> | undefined;

export function parseOtpExchange(data: unknown, now = Date.now()): Quote {
  const body = data as { result?: string; base_code?: string; rates?: { VND?: number }; time_last_update_unix?: number } | null;
  const rate = body?.rates?.VND;
  const timestamp = Number(body?.time_last_update_unix) * 1000;
  if (body?.result !== "success" || body.base_code !== "USD" || typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(timestamp) || timestamp > now + 3600000 || now - timestamp > 172800000) throw new Error("Cotação indisponível.");
  return { vndPerUsd: rate, updatedAt: new Date(timestamp).toISOString() };
}

export async function getOtpExchange(): Promise<Quote> {
  if (cached && cached.until > Date.now()) return cached.quote;
  if (pending) return pending;
  pending = (async () => {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(5000), cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!response.ok) throw new Error("Cotação indisponível.");
    const quote = parseOtpExchange(await response.json());
    cached = { quote, until: Math.min(Date.now() + 3600000, Date.parse(quote.updatedAt) + 172800000) };
    return quote;
  })();
  try { return await pending; } finally { pending = undefined; }
}
