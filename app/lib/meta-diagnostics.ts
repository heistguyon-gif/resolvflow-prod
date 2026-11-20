export type MetaUsageDiagnostic = {
  type: string;
  callPercent?: number;
  cpuPercent?: number;
  timePercent?: number;
  estimatedRecoveryMinutes?: number;
};

export type MetaAttemptDiagnostic = {
  code?: number;
  subcode?: number;
  status?: number;
  requestId?: string;
  endpoint?: string;
  usage?: MetaUsageDiagnostic[];
  retryAfterSeconds?: number;
};

const PREFIX = "[meta:v1]";
const MAX_LENGTH = 900;
const REDACTED = "[redacted]";

export function sanitizeMetaMessage(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.slice(0, 16_000)
    .replace(/https?:\/\/[^\s<>"']+/gi, (raw) => {
      try {
        const url = new URL(raw);
        return `${url.protocol}//${url.host}${url.pathname}`;
      } catch { return "[url redacted]"; }
    })
    .replace(/(["']?)(access[_-]?token|refresh[_-]?token|id[_-]?token|input[_-]?token|token|client[_-]?secret|app[_-]?secret|secret|password|passwd|api[_-]?key|apikey|authorization|client[_-]?assertion)\1\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?:Bearer\s+|Basic\s+)?[^\s,;&}\]]+)/gi, (_all, _quote, key) => `${key}: ${REDACTED}`)
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, REDACTED)
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED)
    .replace(/\b(?:EAA|EAAG|IGQV|IGAA)[A-Za-z0-9_-]{12,}\b/g, REDACTED)
    // eslint-disable-next-line no-control-regex -- Remove unsafe control characters from persisted diagnostics; keep tabs and line breaks.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

export function sanitizeMetaEndpoint(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let path: string;
  try { path = new URL(value, "https://meta.invalid").pathname; }
  catch { return undefined; }
  const safe = sanitizeMetaMessage(path);
  return safe.startsWith("/") ? safe.slice(0, 160) : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000_000 ? Math.round(value * 1000) / 1000 : undefined;
}

function errorCode(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && Math.abs(value) <= 1_000_000_000 ? value : undefined;
}

function safeRequestId(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,120}$/.test(value) && sanitizeMetaMessage(value) === value ? value : undefined;
}

function normalizeUsage(value: unknown): MetaUsageDiagnostic[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).flatMap((item) => {
    const input = record(item);
    const type = typeof input.type === "string" && /^[A-Za-z][A-Za-z0-9_.:-]{0,47}$/.test(input.type) && sanitizeMetaMessage(input.type) === input.type ? input.type : "business";
    const callPercent = numeric(input.callPercent);
    const cpuPercent = numeric(input.cpuPercent);
    const timePercent = numeric(input.timePercent);
    const estimatedRecoveryMinutes = numeric(input.estimatedRecoveryMinutes);
    if ([callPercent, cpuPercent, timePercent, estimatedRecoveryMinutes].every((number) => number === undefined)) return [];
    return [{ type, ...(callPercent !== undefined ? { callPercent } : {}), ...(cpuPercent !== undefined ? { cpuPercent } : {}), ...(timePercent !== undefined ? { timePercent } : {}), ...(estimatedRecoveryMinutes !== undefined ? { estimatedRecoveryMinutes } : {}) }];
  });
}

function normalizeMeta(value: unknown): MetaAttemptDiagnostic {
  const input = record(value);
  const result: MetaAttemptDiagnostic = {};
  for (const key of ["code", "subcode", "status", "retryAfterSeconds"] as const) {
    const number = key === "code" ? errorCode(input[key]) : numeric(input[key]);
    if (number !== undefined) result[key] = number;
  }
  const requestId = safeRequestId(input.requestId) || safeRequestId(input.fbtraceId);
  const endpoint = sanitizeMetaEndpoint(input.endpoint);
  const usage = normalizeUsage(input.usage);
  if (requestId) result.requestId = requestId;
  if (endpoint) result.endpoint = endpoint;
  if (usage.length) result.usage = usage;
  return result;
}

export function metaResponseDiagnostics(headers: Headers, nowMs: number): Pick<MetaAttemptDiagnostic, "usage" | "retryAfterSeconds"> {
  const usage: MetaUsageDiagnostic[] = [];
  const parse = (name: string): unknown => {
    const value = headers.get(name);
    if (!value || value.length > 20_000) return null;
    try { return JSON.parse(value); } catch { return null; }
  };
  const append = (value: unknown, defaultType: string) => {
    const input = record(value);
    const rows = normalizeUsage([{ type: input.type ?? defaultType, callPercent: input.call_count, cpuPercent: input.total_cputime, timePercent: input.total_time, estimatedRecoveryMinutes: input.estimated_time_to_regain_access }]);
    if (usage.length < 4) usage.push(...rows);
  };
  append(parse("x-app-usage"), "app");
  // Business IDs are deliberately discarded; only allowlisted usage values survive.
  for (const rows of Object.values(record(parse("x-business-use-case-usage")))) {
    if (!Array.isArray(rows)) continue;
    for (const item of rows) { append(item, "business"); if (usage.length >= 4) break; }
    if (usage.length >= 4) break;
  }
  const rawRetry = headers.get("retry-after")?.trim();
  let retryAfterSeconds: number | undefined;
  if (rawRetry && /^\d+(?:\.\d+)?$/.test(rawRetry)) retryAfterSeconds = numeric(Number(rawRetry));
  else if (rawRetry) {
    const retryAt = Date.parse(rawRetry);
    if (Number.isFinite(retryAt) && Number.isFinite(nowMs)) retryAfterSeconds = numeric(Math.max(0, Math.ceil((retryAt - nowMs) / 1000)));
  }
  return { ...(usage.length ? { usage } : {}), ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}) };
}

export function serializeMetaAttemptMessage(message: string | null | undefined, error?: unknown): string {
  const meta = normalizeMeta(error);
  const encode = (text: string) => PREFIX + JSON.stringify({ v: 1, message: text, meta });
  while (encode("").length > MAX_LENGTH && meta.usage?.length) meta.usage.pop();
  if (!meta.usage?.length) delete meta.usage;
  const characters = Array.from(sanitizeMetaMessage(message));
  let low = 0; let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (encode(characters.slice(0, middle).join("")).length <= MAX_LENGTH) low = middle;
    else high = middle - 1;
  }
  return encode(characters.slice(0, low).join(""));
}

export function parseMetaAttemptMessage(message: string | null | undefined, legacyCode?: string | number | null): { message: string; meta: MetaAttemptDiagnostic } {
  const raw = typeof message === "string" ? message : "";
  const legacy = typeof legacyCode === "string" && /^-?\d+$/.test(legacyCode.trim()) ? Number(legacyCode) : legacyCode;
  const fallback = errorCode(legacy);
  const legacyMeta = fallback === undefined ? {} : { code: fallback };
  if (raw.startsWith(PREFIX) && raw.length <= 20_000) {
    try {
      const payload = record(JSON.parse(raw.slice(PREFIX.length)));
      if (payload.v === 1 && typeof payload.message === "string" && payload.meta && typeof payload.meta === "object" && !Array.isArray(payload.meta)) {
        return { message: sanitizeMetaMessage(payload.message), meta: { ...legacyMeta, ...normalizeMeta(payload.meta) } };
      }
    } catch { /* Older or damaged records remain readable and sanitized. */ }
  }
  return { message: sanitizeMetaMessage(raw).slice(0, MAX_LENGTH), meta: legacyMeta };
}
