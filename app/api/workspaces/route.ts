import { authErrorResponse, requireWorkspaceContext } from "../../../lib/auth";
import { ensureSecondaryWorkspace, listOwnedWorkspaces } from "../../../lib/workspaces";

const WORKSPACE_COOKIE = "nexoflow_workspace";

function clearWorkspaceCookie() {
  return `${WORKSPACE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function GET(request: Request) {
  try {
    const context = await requireWorkspaceContext(request, "viewer");
    if (context.role === "owner") await ensureSecondaryWorkspace(context);
    const owned = context.role === "owner" ? await listOwnedWorkspaces(context.accountUserId, context.email) : [];
    const current = owned.find((item) => item.id === context.workspaceOwnerUserId) || owned[0] || { id: context.workspaceOwnerUserId, name: "Operação", metaAppKey: "default" as const, status: "active" };
    return new Response(JSON.stringify({
      current: { id: current.id, name: current.name, metaAppKey: current.metaAppKey },
      workspaces: [],
    }), { status: 200, headers: { "content-type": "application/json", "set-cookie": clearWorkspaceCookie() } });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar as operações." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireWorkspaceContext(request, "owner");
    await ensureSecondaryWorkspace(context);
    const owned = await listOwnedWorkspaces(context.accountUserId, context.email);
    const current = owned.find((item) => item.id === context.workspaceOwnerUserId) || owned[0] || { id: context.workspaceOwnerUserId, name: "Operação", metaAppKey: "default" as const, status: "active" };
    return new Response(JSON.stringify({ current: { id: current.id, name: current.name, metaAppKey: current.metaAppKey } }), {
      status: 200,
      headers: { "content-type": "application/json", "set-cookie": clearWorkspaceCookie() },
    });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar a operação." }, { status: 500 });
  }
}
