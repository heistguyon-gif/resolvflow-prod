const MAX_VARIATIONS = 20;
const MAX_CAPTION_CHARS = 2200;

export function cleanCaption(value: string) {
  return value.replace(/\r\n?/g, "\n").trim();
}

export function sanitizeCaptionList(values: unknown[]): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const caption = Array.from(cleanCaption(String(value ?? ""))).slice(0, MAX_CAPTION_CHARS).join("");
    const key = normalizeWords(caption);
    if (!caption || seen.has(key)) continue;
    seen.add(key);
    unique.push(caption);
    if (unique.length >= MAX_VARIATIONS) break;
  }
  return unique;
}

export function parseCaptionVariations(value: unknown): string[] {
  if (Array.isArray(value)) return sanitizeCaptionList(value);
  if (typeof value === "string" && value.trim()) {
    try { return sanitizeCaptionList(JSON.parse(value)); } catch { return sanitizeCaptionList(value.split(/\n-{3,}\n/)); }
  }
  return [];
}

function normalizeWords(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function wordSet(value: string) {
  return new Set(normalizeWords(value).split(" ").filter(Boolean));
}

export function captionSimilarity(left: string, right: string) {
  const a = wordSet(left); const b = wordSet(right);
  if (!a.size && !b.size) return 1;
  let overlap = 0;
  for (const word of a) if (b.has(word)) overlap += 1;
  return overlap / new Set([...a, ...b]).size;
}

export function captionsTooClose(left: string, right: string) {
  if (normalizeWords(left) === normalizeWords(right)) return true;
  const a = splitParts(left); const b = splitParts(right);
  return captionSimilarity(a.hook, b.hook) > 0.84 && captionSimilarity(`${a.body} ${a.cta}`, `${b.body} ${b.cta}`) > 0.84;
}

function distinctEnough(candidate: string, existing: string[]) {
  return existing.every((item) => !captionsTooClose(candidate, item));
}

const PHRASE_ALTS: Array<[RegExp, string[]]> = [
  [/nossa conta de 100k caiu/gi, ["A conta de 100k caiu", "Caiu a conta de 100k", "Perdemos a conta de 100k", "A de 100k caiu", "Nossa página de 100k caiu", "A conta de 100k foi embora"]],
  [/conta de 100k caiu/gi, ["conta de 100k caiu", "página de 100k caiu", "de 100k caiu", "conta de 100k foi embora"]],
  [/estamos voltando com tudo/gi, ["Estamos de volta com tudo", "A gente tá voltando com tudo", "Voltando com tudo", "Tô voltando com tudo", "Recomeçando com tudo", "A volta é agora", "Voltando mais forte"]],
  [/veja a surpresa no perfil/gi, ["A surpresa tá no perfil", "Tem surpresa no perfil", "Olha a surpresa no perfil", "Entra no perfil", "Corre no perfil", "A surpresa ficou no perfil", "Olha o perfil"]],
  [/nossa conta/gi, ["A conta", "Minha conta", "A página"]],
  [/estamos voltando/gi, ["A gente tá voltando", "Tô voltando", "Estamos de volta"]],
  [/voltando com tudo/gi, ["voltando mais forte", "de volta com tudo", "recomeçando com tudo"]],
  [/veja a surpresa/gi, ["Olha a surpresa", "Tem surpresa", "A surpresa tá"]],
  [/no perfil/gi, ["no perfil", "no @"]],
];

function applyAlts(text: string) {
  const options = new Set<string>();
  const seeds = [text];
  for (const [pattern, replacements] of PHRASE_ALTS) {
    const snapshot = [...seeds, ...options];
    for (const item of snapshot) {
      pattern.lastIndex = 0;
      if (!pattern.test(item)) continue;
      for (const replacement of replacements) {
        pattern.lastIndex = 0;
        const next = item.replace(pattern, replacement);
        if (normalizeWords(next) !== normalizeWords(text)) options.add(next);
      }
    }
  }
  return [...options];
}

function splitParts(caption: string) {
  const lines = caption.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length >= 3) return { hook: lines[0], body: lines.slice(1, -1).join("\n"), cta: lines[lines.length - 1] };
  if (lines.length === 2) return { hook: lines[0], body: "", cta: lines[1] };
  return { hook: caption, body: "", cta: "" };
}

function joinParts(hook: string, body: string, cta: string, style: number) {
  const parts = [hook, body, cta].map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "";
  if (style % 4 === 0) return parts.join("\n\n");
  if (style % 4 === 1) return parts.join("\n");
  if (style % 4 === 2) return `${parts[0]}\n\n${parts.slice(1).join("\n")}`;
  return `${parts[0]}\n${parts.slice(1).join("\n\n")}`;
}

function keepEmoji(source: string, target: string) {
  const extras = source.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+/gu) || [];
  let next = target;
  for (const emoji of extras) {
    if (!next.includes(emoji)) next = `${next} ${emoji}`.trim();
  }
  return next.replace(/\s{2,}/g, " ");
}

export function paraphraseCaptions(seed: string, count: number) {
  const wanted = Math.min(MAX_VARIATIONS, Math.max(1, count));
  const original = cleanCaption(seed);
  const parts = splitParts(original);
  let hooks = applyAlts(parts.hook).map((item) => keepEmoji(parts.hook, item));
  let bodies = parts.body ? applyAlts(parts.body) : [parts.body];
  let ctas = parts.cta ? applyAlts(parts.cta).map((item) => keepEmoji(parts.cta, item)) : [parts.cta];
  if (/100k/i.test(parts.hook) && /caiu|saiu/i.test(parts.hook)) {
    hooks.unshift("A de 100k caiu", "Caiu a conta de 100k", "Perdemos a conta de 100k", "A conta de 100k foi embora", "Nossa página de 100k caiu", "A de 100k saiu do ar");
    hooks = hooks.map((item) => keepEmoji(parts.hook, item));
  }
  if (!hooks.length) hooks = [parts.hook];
  if (!bodies.length) bodies = [parts.body];
  if (!ctas.length) ctas = [parts.cta];
  const pool: string[] = [];
  for (let index = 0; index < hooks.length * 4 && pool.length < wanted; index += 1) {
    const hook = hooks[index % hooks.length];
    const body = bodies[Math.floor(index / 2) % bodies.length];
    const cta = ctas[(index + 1) % ctas.length];
    const candidate = joinParts(hook, body, cta, index);
    if (candidate && distinctEnough(candidate, [original, ...pool])) pool.push(candidate);
  }
  return sanitizeCaptionList(pool).slice(0, wanted);
}
