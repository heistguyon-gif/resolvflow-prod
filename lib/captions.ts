export function normalizeCaption(value: string) {
  return value.replace(/\r\n?/g, "\n").trim();
}

export function captionsMatch(expected: string, returned: string) {
  const left = normalizeCaption(expected);
  const right = normalizeCaption(returned);
  if (!left) return true;
  if (left === right) return true;
  const squash = (value: string) => value.replace(/\s+/g, " ").trim();
  return squash(left) === squash(right);
}

function uniqueCaptions(values: string[]) {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const caption = normalizeCaption(value);
    const key = caption.replace(/\s+/g, " ").toLowerCase();
    if (!caption || seen.has(key)) continue;
    seen.add(key);
    unique.push(caption);
  }
  return unique;
}

export function selectCaptionText(base: string, index: number, options: { variations?: string[]; mediaCaption?: string } = {}) {
  const mediaCaption = normalizeCaption(options.mediaCaption || "");
  if (mediaCaption) return mediaCaption;
  const pool = uniqueCaptions(options.variations || []);
  if (pool.length) return pool[Math.abs(index) % pool.length];
  return normalizeCaption(base);
}

export function composeCampaignCaption(caption: string, hashtags: string, index = 0, context: { username?: string; variations?: string[]; mediaCaption?: string } = {}) {
  const chosen = selectCaptionText(caption, index, { variations: context.variations, mediaCaption: context.mediaCaption });
  const combined = [chosen, normalizeCaption(hashtags)].filter(Boolean).join("\n\n");
  return Array.from(combined).slice(0, 2200).join("");
}

export async function captionFingerprint(caption: string) {
  const bytes = new TextEncoder().encode(normalizeCaption(caption));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

export const CAPTION_CONTAINER_PROTOCOL = "caption-v7-legacy-query";

export async function captionContainerSignature(caption: string, protocol = CAPTION_CONTAINER_PROTOCOL) {
  return `${protocol}:${await captionFingerprint(caption)}`;
}
