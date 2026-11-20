// Signed provider URLs are bearer credentials. Never return them to browser lists,
// logs, diagnostics, redirects, or Graph/Bot exports.
export function validateMixotpUrl(value: unknown): string {
  const invalid = () => { throw new Error("Invalid provider URL"); };
  if (typeof value !== "string" || value.length > 4096 || /[\s\\]/.test(value) || [...value].some(character => character.charCodeAt(0) < 32)) return invalid();
  let url: URL; try { url = new URL(value); } catch { return invalid(); }
  if (url.protocol !== "https:" || url.hostname !== "api.mixotp.com" || url.port || url.username || url.password || url.hash
    || url.pathname !== "/api/order/code" || !value.startsWith("https://api.mixotp.com/api/order/code?")) return invalid();
  const keys = [...url.searchParams.keys()];
  if (keys.length !== 2 || new Set(keys).size !== 2 || !keys.includes("orderItemId") || !keys.includes("sign")) return invalid();
  for (const key of keys) if (!/^[A-Za-z0-9_-]{1,1024}$/.test(url.searchParams.get(key) ?? "")) return invalid();
  return url.href;
}

export class MixotpReadError extends Error {
  constructor(public kind: "service" | "throttle" | "redirect_blocked" | "response_size" | "provider_protocol", public wait = 30) { super(kind); }
}

export type MixotpResult = { pending: true } | { pending: false; code: string };
// Business states independently observed by Admin. Never infer OTPs from message.
export function parseMixotpResponse(value: unknown): MixotpResult {
  if (value && typeof value === "object" && !Array.isArray(value)
    && (value as Record<string, unknown>).code === 520
    && (value as Record<string, unknown>).message === "Waiting for verification code") return { pending: true };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const body = value as Record<string, unknown>, data = body.data;
    if (body.code === 0 && body.message === "success" && data && typeof data === "object" && !Array.isArray(data)) {
      const code = (data as Record<string, unknown>).code;
      if (typeof code === "string" && /^\d{6}$/.test(code)) return { pending: false, code };
    }
  }
  throw new MixotpReadError("provider_protocol");
}

export async function readMixotpCode(url: string, fetcher: typeof fetch): Promise<MixotpResult> {
  const endpoint = validateMixotpUrl(url);
  const response = await fetcher(endpoint, { method: "GET", redirect: "manual", credentials: "omit", signal: AbortSignal.timeout(15000), headers: { accept: "application/json" } });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status >= 300 && response.status < 400) throw new MixotpReadError("redirect_blocked");
    if ([429, 503].includes(response.status)) {
      const raw = response.headers.get("retry-after");
      throw new MixotpReadError("throttle", raw && /^\d+$/.test(raw) ? Math.max(1, Math.min(86400, Number(raw))) : 30);
    }
    throw new MixotpReadError("service");
  }
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) { await response.body?.cancel(); throw new MixotpReadError("provider_protocol"); }
  const reader = response.body?.getReader();
  if (!reader) throw new MixotpReadError("provider_protocol");
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > 256000) throw new MixotpReadError("response_size"); chunks.push(value); }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body: unknown; try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new MixotpReadError("provider_protocol"); }
  return parseMixotpResponse(body);
}
