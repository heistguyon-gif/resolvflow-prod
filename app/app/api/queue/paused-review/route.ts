import { authErrorResponse, requireOwnerId } from "../../../../lib/auth";
import { requireReadOnlyOwnerId } from "../../../../lib/campaign-read-access";
import { cancelReviewedPosts, MAX_REVIEW_CANCEL, readPausedReview, REVIEW_HEADERS } from "../../../../lib/queue-paused-review";

function scoped(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope");
  return !scope || scope === "workspace";
}

export async function GET(request: Request) {
  try {
    const ownerUserId = await requireReadOnlyOwnerId(request);
    if (!scoped(request)) return Response.json({ error: "A revisão usa somente o workspace atual." }, { status: 400, headers: REVIEW_HEADERS });
    const params = new URL(request.url).searchParams;
    const page = Math.min(100_000, Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1));
    return Response.json(await readPausedReview(ownerUserId, page, params.get("view") === "protected" ? "protected" : "pending"), { headers: REVIEW_HEADERS });
  } catch (error) {
    return authErrorResponse(error) || Response.json({ error: "Não foi possível consultar as pausadas. Tente atualizar novamente." }, { status: 500, headers: REVIEW_HEADERS });
  }
}

export async function POST(request: Request) {
  try {
    const ownerUserId = await requireOwnerId(request, "editor");
    if (!scoped(request)) return Response.json({ error: "A revisão usa somente o workspace atual." }, { status: 400, headers: REVIEW_HEADERS });
    const body = await request.json() as { action?: unknown; confirmation?: unknown; items?: unknown; scope?: unknown };
    if (body.action !== "cancel" || body.confirmation !== "CANCELAR" || (body.scope !== undefined && body.scope !== "workspace") || !Array.isArray(body.items) || !body.items.length || body.items.length > MAX_REVIEW_CANCEL) {
      return Response.json({ error: "Confirme o cancelamento de 1 a 50 publicações selecionadas." }, { status: 400, headers: REVIEW_HEADERS });
    }
    const items: Array<{ id: string; snapshot: string }> = [];
    for (const value of body.items) {
      if (!value || typeof value !== "object" || typeof value.id !== "string" || !value.id || value.id.length > 120 || typeof value.snapshot !== "string" || !/^[a-f0-9]{64}$/.test(value.snapshot) || items.some(item => item.id === value.id)) {
        return Response.json({ error: "Seleção inválida ou duplicada. Atualize e selecione novamente." }, { status: 400, headers: REVIEW_HEADERS });
      }
      items.push({ id: value.id, snapshot: value.snapshot });
    }
    return Response.json(await cancelReviewedPosts(request, ownerUserId, items), { headers: REVIEW_HEADERS });
  } catch (error) {
    return authErrorResponse(error) || Response.json({ error: "Não foi possível confirmar o resultado. Atualize a revisão antes de tentar outra ação.", refreshRequired: true }, { status: 503, headers: REVIEW_HEADERS });
  }
}
