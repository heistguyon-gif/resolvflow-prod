import { authErrorResponse, requireWorkspaceContext } from "../../../../lib/auth";
import { recordAuditEvent } from "../../../../lib/audit";
import { validateMetaAppInput, META_INSTAGRAM_SCOPES, metaAppSetup } from "../../../../lib/meta-app-registry";
import { listOwnMetaApps, registerOwnMetaApp, setOwnMetaAppStatus } from "../../../../lib/user-meta-apps";

const noStore = { "cache-control": "private, no-store" };

function publicOrigin(request: Request) {
  const url = new URL(request.url);
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" ? url.origin : "https://resolvflow.online";
}

export async function GET(request: Request) {
  try {
    const ctx = await requireWorkspaceContext(request, "viewer");
    const canManage = ctx.role === "owner" || ctx.role === "editor";
    const apps = await listOwnMetaApps(ctx.workspaceOwnerUserId, { revealVerifyToken: canManage, origin: publicOrigin(request) });
    const generic = metaAppSetup("<id-do-app-no-painel>", null, publicOrigin(request));
    return Response.json({ canManage, apps, tutorial: { redirectUri: generic.redirectUri, webhookUrlPattern: generic.webhookUrl, scopes: META_INSTAGRAM_SCOPES } }, { headers: noStore });
  } catch (error) {
    const auth = authErrorResponse(error); if (auth) return auth;
    return Response.json({ error: "Não foi possível ler os apps Meta." }, { status: 502, headers: noStore });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspaceContext(request, "editor");
    let body: unknown;
    try { body = await request.json(); } catch { return Response.json({ error: "Dados inválidos." }, { status: 400, headers: noStore }); }
    const input = validateMetaAppInput(body);
    if (!input.ok) return Response.json({ error: input.error }, { status: 400, headers: noStore });
    const result = await registerOwnMetaApp({ ...input.value, accountUserId: ctx.accountUserId, workspaceOwnerUserId: ctx.workspaceOwnerUserId, origin: publicOrigin(request) });
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status, headers: noStore });
    await recordAuditEvent(request, { ownerUserId: ctx.workspaceOwnerUserId, action: "meta_app.user_register", entityType: "meta_app", entityId: result.id,
      summary: `App Meta "${input.value.label}" cadastrado no painel.`, metadata: { appId: input.value.appId } });
    const apps = await listOwnMetaApps(ctx.workspaceOwnerUserId, { revealVerifyToken: true, origin: publicOrigin(request) });
    return Response.json({ id: result.id, apps }, { status: 201, headers: noStore });
  } catch (error) {
    const auth = authErrorResponse(error); if (auth) return auth;
    return Response.json({ error: error instanceof Error && error.message.includes("chave de proteção") ? error.message : "Não foi possível cadastrar o app." }, { status: 503, headers: noStore });
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireWorkspaceContext(request, "editor");
    const body = await request.json().catch(() => ({})) as { id?: unknown; status?: unknown };
    const id = typeof body.id === "string" ? body.id : "";
    const status = body.status === "active" || body.status === "disabled" ? body.status : null;
    if (!id || !status) return Response.json({ error: "Dados inválidos." }, { status: 400, headers: noStore });
    const updated = await setOwnMetaAppStatus(ctx.workspaceOwnerUserId, id, status);
    if (!updated) return Response.json({ error: "App não encontrado neste workspace." }, { status: 404, headers: noStore });
    await recordAuditEvent(request, { ownerUserId: ctx.workspaceOwnerUserId, action: status === "active" ? "meta_app.user_enable" : "meta_app.user_disable", entityType: "meta_app", entityId: id,
      summary: `App Meta "${updated.label}" ${status === "active" ? "reativado" : "desativado"}.` });
    return Response.json({ apps: await listOwnMetaApps(ctx.workspaceOwnerUserId, { revealVerifyToken: true, origin: publicOrigin(request) }) }, { headers: noStore });
  } catch (error) {
    const auth = authErrorResponse(error); if (auth) return auth;
    return Response.json({ error: "Não foi possível atualizar o app." }, { status: 502, headers: noStore });
  }
}
