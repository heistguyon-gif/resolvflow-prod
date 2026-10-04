import { getDb } from "../../../../../db";
import { oauthStates } from "../../../../../db/schema";
import { authErrorResponse, requireWorkspaceContext } from "../../../../../lib/auth";
import { NEXOFLOW_QUARANTINE, quarantineResponse } from "../../../../../lib/quarantine";
import { facebookAuthorizationUrl } from "../../../../../lib/meta-api";
import { facebookMetaConfig } from "../../../../../lib/runtime-env";

export async function GET(request: Request) {
  try {
    const context = await requireWorkspaceContext(request, "editor");
    if (NEXOFLOW_QUARANTINE) return quarantineResponse();
    const url = new URL(request.url);
    const config = facebookMetaConfig();
    if (!config.configured) throw new Error("A conexão por Facebook ainda precisa do ID e da chave secreta do aplicativo principal da Meta.");
    const redirectUri = config.redirectUri || `${url.origin}/api/meta/facebook/callback`;
    const state = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    await getDb().insert(oauthStates).values({ state, ownerUserId: context.workspaceOwnerUserId, metaAppKey: "default", returnTo: "/contas", expiresAt });
    return Response.redirect(facebookAuthorizationUrl(state, redirectUri), 302);
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    const message = error instanceof Error ? error.message : "Não foi possível iniciar a conexão pelo Facebook.";
    return Response.json({ error: message }, { status: 503 });
  }
}