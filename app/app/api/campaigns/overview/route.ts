import { authErrorResponse } from "../../../../lib/auth";
import { requireReadOnlyOwnerId } from "../../../../lib/campaign-read-access";
import { campaignOverview } from "../../../../lib/campaign-overview";
import { CAMPAIGN_READ_HEADERS } from "../../../../lib/campaign-management";

export async function GET(request: Request) {
  try {
    const ownerUserId = await requireReadOnlyOwnerId(request);
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") || 1);
    const size = Number(url.searchParams.get("pageSize") || 20);
    const pageSize = Math.min(size, 50);
    if (url.searchParams.has("scope") || url.searchParams.has("ownerUserId") || url.searchParams.has("workspaceId")
      || !Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(size) || size < 1 || !Number.isSafeInteger((page - 1) * pageSize)) {
      return Response.json({ error: "Escopo ou paginação inválidos." }, { status: 400, headers: CAMPAIGN_READ_HEADERS });
    }
    return Response.json(await campaignOverview(ownerUserId, page, pageSize), { headers: CAMPAIGN_READ_HEADERS });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) { authResponse.headers.set("cache-control", CAMPAIGN_READ_HEADERS["cache-control"]); return authResponse; }
    return Response.json({ error: "Não foi possível consultar o acompanhamento das campanhas." }, { status: 500, headers: CAMPAIGN_READ_HEADERS });
  }
}
