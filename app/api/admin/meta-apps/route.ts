import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { appUsers, workspaceMembers, workspaces } from "../../../../db/schema";
import { authErrorResponse, requirePlatformAdmin } from "../../../../lib/auth";
import { recordAuditEvent } from "../../../../lib/audit";
import { runtimeEnv } from "../../../../lib/runtime-env";
import { listWorkspaceMetaAppsForAdmin, setWorkspaceMetaAppStatus, upsertWorkspaceMetaApp } from "../../../../lib/workspace-meta-apps";

const APP_ID_PATTERN = /^\d{5,40}$/;
const GRAPH_VERSION_PATTERN = /^v\d+\.\d+$/;

function configuredRedirect(request: Request) {
  const redirect = runtimeEnv().META_REDIRECT_URI || `${new URL(request.url).origin}/api/meta/callback`;
  return redirect === "https://resolvflow.online/api/meta/callback" ? redirect : "https://resolvflow.online/api/meta/callback";
}

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const db = getDb();
    const [apps, rows] = await Promise.all([
      listWorkspaceMetaAppsForAdmin(),
      db.select({
        workspaceOwnerUserId: workspaces.id,
        workspaceName: workspaces.name,
        workspaceStatus: workspaces.status,
        ownerEmail: workspaceMembers.email,
        ownerName: appUsers.displayName,
      }).from(workspaces)
        .leftJoin(workspaceMembers, and(eq(workspaceMembers.workspaceOwnerUserId, workspaces.id), eq(workspaceMembers.role, "owner"), eq(workspaceMembers.status, "active")))
        .leftJoin(appUsers, eq(appUsers.id, workspaceMembers.accountUserId))
        .where(eq(workspaces.status, "active"))
        .orderBy(asc(workspaces.name)),
    ]);
    const workspacesList = rows.map((row) => ({
      workspaceOwnerUserId: row.workspaceOwnerUserId,
      workspaceName: row.workspaceName,
      ownerEmail: row.ownerEmail || null,
      ownerName: row.ownerName || null,
    }));
    return Response.json({ apps, workspaces: workspacesList, redirectUri: configuredRedirect(request), graphVersion: runtimeEnv().META_GRAPH_VERSION || "v26.0" });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar os Apps Meta." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requirePlatformAdmin(request);
    const payload = await request.json() as { workspaceOwnerUserId?: string; label?: string; appId?: string; appSecret?: string };
    const workspaceOwnerUserId = String(payload.workspaceOwnerUserId || "").trim();
    const label = String(payload.label || "").trim().slice(0, 100);
    const appId = String(payload.appId || "").trim();
    const appSecret = String(payload.appSecret || "").trim();
    if (!workspaceOwnerUserId || !label || !APP_ID_PATTERN.test(appId) || appSecret.length < 12 || appSecret.length > 512) {
      return Response.json({ error: "Informe workspace, nome, App ID válido e App Secret." }, { status: 400 });
    }
    const [workspace] = await getDb().select({ id: workspaces.id, name: workspaces.name, status: workspaces.status }).from(workspaces).where(eq(workspaces.id, workspaceOwnerUserId)).limit(1);
    if (!workspace || workspace.status !== "active") return Response.json({ error: "Workspace não encontrado ou inativo." }, { status: 404 });
    const graphVersion = runtimeEnv().META_GRAPH_VERSION || "v26.0";
    if (!GRAPH_VERSION_PATTERN.test(graphVersion)) return Response.json({ error: "A versão global da Graph API não é válida." }, { status: 500 });
    const id = await upsertWorkspaceMetaApp({
      workspaceOwnerUserId,
      label,
      appId,
      appSecret,
      graphVersion,
      redirectUri: configuredRedirect(request),
      createdByUserId: context.accountUserId,
    });
    await recordAuditEvent(request, {
      ownerUserId: workspaceOwnerUserId,
      action: "workspace_meta_app.upsert",
      entityType: "workspace_meta_app",
      entityId: id,
      summary: `App Meta “${label}” configurado para ${workspace.name}.`,
      metadata: { appId, graphVersion, redirectUri: configuredRedirect(request) },
    });
    return Response.json({ saved: true, id });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar o App Meta." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requirePlatformAdmin(request);
    const payload = await request.json() as { id?: string; action?: string };
    const id = String(payload.id || "").trim();
    const status = payload.action === "activate" ? "active" : payload.action === "disable" ? "disabled" : null;
    if (!id || !status) return Response.json({ error: "Ação inválida." }, { status: 400 });
    const updated = await setWorkspaceMetaAppStatus(id, status);
    if (!updated) return Response.json({ error: "App Meta não encontrado." }, { status: 404 });
    await recordAuditEvent(request, {
      ownerUserId: updated.workspaceOwnerUserId,
      action: `workspace_meta_app.${status}`,
      entityType: "workspace_meta_app",
      entityId: updated.id,
      summary: `App Meta “${updated.label}” ${status === "active" ? "ativado" : "desativado"}.`,
      metadata: { changedBy: context.email },
    });
    return Response.json({ updated: true, status });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o App Meta." }, { status: 500 });
  }
}
