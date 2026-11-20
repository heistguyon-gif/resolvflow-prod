import { authErrorResponse, requireOwnerId } from "../../../lib/auth";
import { NEXOFLOW_META_CONNECTIONS_ENABLED, NEXOFLOW_QUARANTINE, QUARANTINE_MESSAGE } from "../../../lib/quarantine";

function statusPayload() {
  return {
    quarantine: NEXOFLOW_QUARANTINE,
    publishingEnabled: !NEXOFLOW_QUARANTINE,
    connectionEnabled: NEXOFLOW_META_CONNECTIONS_ENABLED,
    message: NEXOFLOW_QUARANTINE ? QUARANTINE_MESSAGE : "Motor de publicação disponível.",
  };
}

export async function GET() {
  return Response.json(statusPayload());
}

export async function POST(request: Request) {
  try {
    await requireOwnerId(request, "viewer");
    return Response.json(statusPayload());
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível ativar a quarentena." }, { status: 500 });
  }
}
