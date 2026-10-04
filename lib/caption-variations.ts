import { env } from "cloudflare:workers";
import { cleanCaption, parseCaptionVariations, sanitizeCaptionList } from "./caption-paraphrase";

export { parseCaptionVariations, sanitizeCaptionList } from "./caption-paraphrase";

const MAX_VARIATIONS = 20;
const AI_MODELS = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/openai/gpt-oss-20b",
];

type AiBinding = { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };

function normalizeKey(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function extractJsonArray(text: string): string[] {
  const stripped = text.replace(/```json|```/g, "").trim();
  const match = stripped.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => typeof item === "string" ? item : String(item));
    } catch { /* tenta objeto */ }
  }
  try {
    const parsed = JSON.parse(stripped) as { variations?: unknown };
    if (Array.isArray(parsed?.variations)) return parsed.variations.map((item) => String(item));
  } catch { /* lista numerada */ }
  return stripped.split(/\n+/).map((line) => line.replace(/^\s*(?:\d+[\).:\-]\s*|[-*]\s*)/, "").replace(/^["']|["']$/g, "").trim()).filter((line) => line.length > 8 && !line.startsWith("[") && !/^varia/i.test(line));
}

async function aiText(result: unknown): Promise<string> {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  const payload = result as Record<string, unknown> & { text?: () => Promise<string> | string };
  if (typeof payload.text === "function") {
    const text = await payload.text();
    if (typeof text === "string" && text.trim()) return text;
  }
  if (typeof payload.response === "string") return payload.response;
  if (typeof payload.result === "string") return payload.result;
  if (payload.result && typeof payload.result === "object") {
    const nested = payload.result as Record<string, unknown>;
    if (typeof nested.response === "string") return nested.response;
  }
  const choices = payload.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
    const choice = choices[0] as { message?: { content?: string }; text?: string };
    return choice.message?.content || choice.text || "";
  }
  return "";
}

async function runWorkersAi(prompt: string) {
  const ai = (env as unknown as { AI?: AiBinding }).AI;
  if (!ai?.run) throw new Error("A IA da Cloudflare não está ligada nesta conta.");
  let lastError: unknown;
  for (const model of AI_MODELS) {
    try {
      const result = await ai.run(model, {
        messages: [
          { role: "system", content: "Você é copywriter de Instagram no Brasil. Escreve legendas novas, com a mesma intenção, como se cada uma tivesse saído da cabeça de uma pessoa diferente. Nunca só troca palavra. Responde somente JSON." },
          { role: "user", content: prompt },
        ],
        max_tokens: 1800,
        temperature: 0.95,
      });
      const text = await aiText(result);
      if (text.trim()) return text;
      lastError = new Error(`${model} respondeu vazio.`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("A IA não respondeu.");
}

export async function generateCaptionVariations(seed: string, count: number) {
  const wanted = Math.min(MAX_VARIATIONS, Math.max(2, count || 6));
  const original = cleanCaption(seed);
  if (!original) throw new Error("Escreva a legenda base antes de gerar variações.");
  const prompt = `Escreva ${wanted} legendas NOVAS de Instagram em português do Brasil.

A legenda original é a ideia, não o molde. Cada versão precisa parecer escrita por uma pessoa diferente: outro gancho, outro ritmo, outra quebra de linha, outra forma de pedir o clique.

Mantenha só o que importa:
- o fato central
- o CTA (ir ao perfil / ver a surpresa)
- o tom
- emojis 🔞 e 💔 se existirem
- 100k se existir

Proibido:
- só reorganizar as mesmas frases
- só trocar “nossa” por “a nossa”, “caiu” por “saiu do ar”, “veja” por “olha”
- hashtag nova, aspas, numeração, explicação

Responda SOMENTE um JSON array com ${wanted} strings.

Legenda original:
"""
${original}
"""`;
  const raw = await runWorkersAi(prompt);
  const originalKey = normalizeKey(original);
  const variations = sanitizeCaptionList(extractJsonArray(raw)).filter((item) => normalizeKey(item) !== originalKey);
  if (variations.length < 2) throw new Error("A IA não criou variações suficientes. Tente gerar de novo.");
  return { variations: variations.slice(0, wanted), source: "ai" as const };
}
