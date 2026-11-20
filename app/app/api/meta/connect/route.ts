import { getDb } from "../../../../db";
import { oauthStates } from "../../../../db/schema";
import { requireWorkspaceContext, authErrorResponse } from "../../../../lib/auth";
import { NEXOFLOW_META_CONNECTIONS_ENABLED } from "../../../../lib/quarantine";
import { instagramAuthorizationUrl } from "../../../../lib/meta-api";
import { resolveConnectableMetaApp } from "../../../../lib/workspace-meta-apps";

export async function GET(request: Request) {
  try {
    const context = await requireWorkspaceContext(request, "editor");
    if (!NEXOFLOW_META_CONNECTIONS_ENABLED) return Response.json({ error: "Novas conexões com a Meta estão temporariamente desativadas." }, { status: 423 });
    const url = new URL(request.url);
    // Only real registered/assigned apps; env/built-in apps can no longer start new connections.
    const app = await resolveConnectableMetaApp({
      accountUserId: context.accountUserId,
      workspaceOwnerUserId: context.workspaceOwnerUserId,
      requestedKey: url.searchParams.get("app"),
    });
    if (!app) return Response.json({ error: "Cadastre o seu app Meta (Contas → Apps Meta) ou escolha um app atribuído a você neste workspace." }, { status: 403 });
    if (!app.configured) return Response.json({ error: "O aplicativo Meta escolhido ainda não foi configurado." }, { status: 503 });
    const redirectUri = app.redirectUri || `${url.origin}/api/meta/callback`;
    const state = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    await getDb().insert(oauthStates).values({
      state,
      ownerUserId: context.workspaceOwnerUserId,
      initiatedByUserId: context.accountUserId,
      operationId: context.workspaceOwnerUserId,
      metaAppKey: app.key,
      redirectUri,
      returnTo: "/contas",
      expiresAt,
    });
    return Response.redirect(instagramAuthorizationUrl(state, redirectUri, app), 302);
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    const message = error instanceof Error ? error.message : "Não foi possível iniciar a conexão com a Meta.";
    return Response.json({ error: message }, { status: 503 });
  }
}
