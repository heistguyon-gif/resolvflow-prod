/** Display-only formatting for TOP. Stored timestamps and API filters stay unchanged. */
export const ADMIN_TIME_ZONE = "America/Sao_Paulo";

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short", timeStyle: "short", timeZone: ADMIN_TIME_ZONE,
});
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short", timeZone: ADMIN_TIME_ZONE,
});
const clockFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ADMIN_TIME_ZONE,
});

export function parseAdminInstant(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const input = value.trim();
  if (!input) return null;
  // SQLite CURRENT_TIMESTAMP has no zone marker, but its value is UTC.
  const naiveUtc = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/.exec(input);
  if (naiveUtc) {
    const parsed = new Date(`${input.replace(" ", "T")}Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() !== Number(naiveUtc[1]) ||
      parsed.getUTCMonth() + 1 !== Number(naiveUtc[2]) || parsed.getUTCDate() !== Number(naiveUtc[3]) ||
      parsed.getUTCHours() !== Number(naiveUtc[4]) || parsed.getUTCMinutes() !== Number(naiveUtc[5]) ||
      parsed.getUTCSeconds() !== Number(naiveUtc[6])) return null;
    return parsed;
  }

  // Explicit Z/offset already identifies the instant. Normalize only SQLite's separator.
  const parsed = new Date(input.replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatAdminDateTime(value: string | Date | null | undefined, fallback = "—"): string {
  const parsed = parseAdminInstant(value);
  return parsed ? `${dateTimeFormatter.format(parsed)} (Brasília)` : fallback;
}

export function formatAdminDate(value: string | Date | null | undefined, fallback = "—"): string {
  const parsed = parseAdminInstant(value);
  return parsed ? `${dateFormatter.format(parsed)} (Brasília)` : fallback;
}

/** Convert a UTC clock reading using the offset applicable to its reference day. */
export function formatAdminUtcClock(value: string | null | undefined, reference: Date = new Date(), fallback = "—"): string {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number.isNaN(reference.getTime())) return fallback;
  const instant = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate(), Number(match[1]), Number(match[2])));
  return `${clockFormatter.format(instant)} (Brasília)`;
}
