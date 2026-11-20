import { parseMetaAttemptMessage } from "../../lib/meta-diagnostics";

export type PublishedQueueRecord = {
  id: string;
  status: string;
  username?: string | null;
  campaignName?: string | null;
  mediaType?: string | null;
  captionOverride?: string | null;
  captionFallback?: string | null;
  publishedPermalink?: string | null;
  publishedMediaId?: string | null;
  publishedAt?: string | null;
  scheduledFor?: string | null;
  mediaViews?: number | null;
  mediaReach?: number | null;
  insightsSyncedAt?: string | null;
  insightsError?: string | null;
  lastError?: string | null;
  attemptCount?: number | null;
  maxAttempts?: number | null;
};

export function isPublishedQueuePilot(email: unknown): boolean {
  return typeof email === "string" && email.trim().toLowerCase() === "lucasbgn.affiliate@gmail.com";
}

// Only the persisted permalink is used. A Graph media/container ID is never a shortcode.
export function publishedInstagramUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  const raw = value.trim();
  if (!raw || /[\s\\]/.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !["instagram.com", "www.instagram.com", "m.instagram.com"].includes(url.hostname)
      || url.port || url.username || url.password) return null;
    const publication = /^\/(?:p|reel|tv)\/[A-Za-z0-9_-]{1,64}\/?$/;
    const story = /^\/stories\/[A-Za-z0-9._]{1,30}\/[0-9]{5,30}\/?$/;
    if (!publication.test(url.pathname) && !story.test(url.pathname)) return null;
    // Tracking / sensitive query values and fragments never enter the rendered DOM.
    return url.origin + url.pathname;
  } catch { return null; }
}

export function publishedQueueTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  // SQLite timestamps in this application's persisted contract are UTC.
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
    ? value.replace(" ", "T") + "Z" : value;
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(iso)) return null;
  const epoch = Date.parse(iso);
  if (!Number.isFinite(epoch)) return null;
  return { iso: new Date(epoch).toISOString(), label: new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    hourCycle: "h23", timeZoneName: "short",
  }).format(epoch) };
}

export function publishedQueueMetric(value: unknown, syncedAt: unknown): string | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
  // Schema defaults are 0 even before Meta has returned metrics. Only a complete
  // insights sync distinguishes a confirmed zero from that default; positive
  // partial readings can be shown without inventing a sync time.
  if (value === 0 && !publishedQueueTime(syncedAt)) return null;
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function publishedQueueNotice(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return parseMetaAttemptMessage(value).message || null;
}
