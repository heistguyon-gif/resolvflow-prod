import { authErrorResponse, requireOwnerId } from "../../../../lib/auth";
import { syncMetaAccounts } from "../../../../lib/meta-sync";
import { NEXOFLOW_QUARANTINE, quarantineResponse } from "../../../../lib/quarantine";

export async function POST(request: Request) {
  try {
    const ownerUserId = await requireOwnerId(request);
    if (NEXOFLOW_QUARANTINE) return quarantineResponse();
    const payload = await request.json().catch(() => ({})) as { runStartedAt?: string; automatic?: boolean };
    const automatic = payload.automatic === true;
    return Response.json(await syncMetaAccounts({
      ownerUserId,
      automatic,
      maxMediaPerConnection: automatic ? 8 : 8,
      maxConnections: automatic ? 2 : 8,
      skipAccountInsights: false,
      runStartedAt: payload.runStartedAt,
    }));
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível sincronizar." }, { status: 500 });
  }
}
