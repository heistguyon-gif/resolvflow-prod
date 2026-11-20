import { authErrorResponse, requireOwnerId } from "../../../../lib/auth";
import { archiveCampaign, CAMPAIGN_READ_HEADERS, CampaignManagementError, duplicateCampaign } from "../../../../lib/campaign-management";
import type { CampaignBulkItemResult, CampaignBulkResponse } from "../../../../lib/campaign-management-types";

export async function POST(request: Request) {
  try {
    const ownerUserId = await requireOwnerId(request, "editor");
    let payload: { action?: unknown; ids?: unknown };
    try { payload = await request.json(); } catch { return Response.json({ error: "JSON inválido." }, { status: 400, headers: CAMPAIGN_READ_HEADERS }); }
    if (!payload || !["duplicate", "delete"].includes(String(payload.action)) || !Array.isArray(payload.ids)
      || payload.ids.length < 1 || payload.ids.length > 50
      || payload.ids.some((id) => typeof id !== "string" || !id.trim() || id.length > 200)) {
      return Response.json({ error: "Informe uma ação válida e de 1 a 50 identificadores de campanha." }, { status: 400, headers: CAMPAIGN_READ_HEADERS });
    }
    const ids = [...new Set((payload.ids as string[]).map((id) => id.trim()))];
    const results: CampaignBulkItemResult[] = [];
    for (const id of ids) {
      try {
        if (payload.action === "duplicate") {
          const { duplicate, warnings } = await duplicateCampaign(request, ownerUserId, id);
          results.push({ id, ok: true, campaign: duplicate, warnings });
        } else {
          const archive = await archiveCampaign(request, ownerUserId, id);
          results.push({ id, ok: true, archive });
        }
      } catch (error) {
        results.push({ id, ok: false,
          status: error instanceof CampaignManagementError ? error.status : 500,
          error: error instanceof CampaignManagementError ? error.message : "Não foi possível concluir esta ação.",
          ...(error instanceof CampaignManagementError && error.archived ? { archived: true } : {}),
        });
      }
    }
    const successes = results.filter((item) => item.ok).length;
    const response: CampaignBulkResponse = { results, successes, failures: results.length - successes };
    return Response.json(response, { headers: CAMPAIGN_READ_HEADERS });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: "Não foi possível processar o lote de campanhas." }, { status: 500, headers: CAMPAIGN_READ_HEADERS });
  }
}
