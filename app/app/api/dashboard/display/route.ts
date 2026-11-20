import { authErrorResponse, requireWorkspaceContext } from "../../../../lib/auth";
import { isFeatureEnabled } from "../../../../lib/feature-rollouts";
import { getMediaBucket } from "../../../../lib/media-storage";
import { BodyLimitError, readLimitedBody } from "../../../../lib/request-body";
import { dashboardDisplayKey, dashboardDisplayView, parseDashboardDisplay, parseDashboardDetails } from "../../../../lib/dashboard-display";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });

async function handle(request: Request) {
  try {
    const context = await requireWorkspaceContext(request, "viewer");
    if (!isFeatureEnabled("dashboardDisplayEditor", context.email)) return json({ error: "Sem permissão." }, 403);
    let view: string;
    try { view = dashboardDisplayView(new URL(request.url)); } catch { return json({ error: "Visão inválida." }, 400); }
    const key = dashboardDisplayKey(context.accountUserId, context.workspaceOwnerUserId, view);
    if (request.method === "PUT" && (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site")) return json({ error: "Origem inválida." }, 403);
    const bucket = getMediaBucket();
    if (request.method === "GET") {
      const object = await bucket.get(key);
      const saved = object ? await object.json<{ metrics: unknown; details?: unknown }>() : null;
      return json({ metrics: saved ? parseDashboardDisplay(saved.metrics) : {}, details: parseDashboardDetails(saved?.details), revision: object?.etag ?? null });
    }
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return json({ error: "Envie JSON." }, 415);
    let payload: { metrics: ReturnType<typeof parseDashboardDisplay>; details: ReturnType<typeof parseDashboardDetails>; revision: string | null };
    try {
      const input = JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 256 * 1024)));
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(k => !["metrics", "details", "revision"].includes(k)) || !(input.revision === null || typeof input.revision === "string" && input.revision.length <= 128)) throw new Error("Dados inválidos.");
      payload = { metrics: parseDashboardDisplay(input.metrics), details: parseDashboardDetails(input.details), revision: input.revision };
    } catch (error) { return json({ error: error instanceof Error ? error.message : "Dados inválidos." }, error instanceof BodyLimitError ? 413 : 400); }
    const stored = await bucket.put(key, JSON.stringify({ metrics: payload.metrics, details: payload.details, updatedAt: new Date().toISOString() }), { onlyIf: payload.revision === null ? { etagDoesNotMatch: "*" } : { etagMatches: payload.revision }, httpMetadata: { contentType: "application/json", cacheControl: "private, no-store" } });
    if (!stored) return json({ error: "Os valores foram alterados em outra janela. Feche e abra o editor para recarregar antes de salvar." }, 409);
    return json({ metrics: payload.metrics, details: payload.details, revision: stored.etag });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) { auth.headers.set("cache-control", "private, no-store"); return auth; }
    return json({ error: "Não foi possível acessar os valores. Tente novamente." }, 503);
  }
}
export const GET = handle;
export const PUT = handle;
