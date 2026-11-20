export type CrmExchange = { brlPerUsd: number; updatedAt: string; source: "open.er-api.com" };
let cached: { quote: CrmExchange; until: number } | undefined;
let pending: Promise<CrmExchange> | undefined;
const MAX_AGE = 48 * 60 * 60 * 1000;

export function parseCrmExchange(data: unknown, now = Date.now()): CrmExchange {
  const body = data as { result?: string; base_code?: string; rates?: { BRL?: number }; time_last_update_unix?: number } | null;
  const rate = body?.rates?.BRL;
  const time = body?.time_last_update_unix;
  if (body?.result !== "success" || body.base_code !== "USD" || typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0 || rate > 100 || typeof time !== "number" || !Number.isSafeInteger(time) || time <= 0 || time * 1000 > now + 3600000 || now - time * 1000 >= MAX_AGE) throw new Error("Cotação USD/BRL indisponível.");
  return { brlPerUsd: rate, updatedAt: new Date(time * 1000).toISOString(), source: "open.er-api.com" };
}

export async function getCrmExchange(): Promise<CrmExchange> {
  if (cached && cached.until > Date.now()) return cached.quote;
  if (pending) return pending;
  pending = (async () => {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(5000), cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!response.ok) throw new Error("Cotação USD/BRL indisponível.");
    const quote = parseCrmExchange(await response.json());
    cached = { quote, until: Math.min(Date.now() + 3600000, Date.parse(quote.updatedAt) + MAX_AGE) };
    return quote;
  })();
  try { return await pending; } finally { pending = undefined; }
}
