export type MailChronologyEvent = { id: string; receivedAt?: string | null; observedAt?: string | null };
export type MailEventTime = { kind: "received" | "observed" | "unknown"; epochMs: number | null; value: string | null };

// Require an explicit offset, valid calendar date, and finite instant. Never
// interpret an ambiguous local time according to the browser/server timezone.
function instant(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59
    || (zone !== "Z" && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

export function mailEventTime(message: MailChronologyEvent, source?: string): MailEventTime {
  const kind = source === "mixotp" ? "observed" : "received";
  const value = kind === "observed" ? message.observedAt : message.receivedAt;
  const epochMs = instant(value);
  return epochMs === null ? { kind: "unknown", epochMs: null, value: null } : { kind, epochMs, value: value! };
}

export function compareMailEvents(a: MailChronologyEvent, b: MailChronologyEvent, source?: string, otherSource = source): number {
  const at = mailEventTime(a, source).epochMs, bt = mailEventTime(b, otherSource).epochMs;
  if (at !== bt) return at === null ? 1 : bt === null ? -1 : bt - at;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortMailEvents<T extends MailChronologyEvent>(messages: readonly T[], source?: string): T[] {
  return [...messages].sort((a, b) => compareMailEvents(a, b, source));
}
