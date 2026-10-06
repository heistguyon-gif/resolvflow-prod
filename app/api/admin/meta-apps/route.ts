import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { appUsers, metaAppAssignments, metaApps, metaAppUserPolicies, workspaceMembers, workspaces } from "../../../../db/schema";
import { authErrorResponse, requirePlatformAdmin } from "../../../../lib/auth";
import { recordAuditEvent } from "../../../../lib/audit";
import { runtimeEnv } from "../../../../lib/runtime-env";
import { createMetaApp, listMetaAppsForAdmin, setMetaAppStatus } from "../../../../lib/workspace-meta-apps";

const APP_ID_PATTERN = /^\d{5,40}$/;
const GRAPH_VERSION_PATTERN = /^v\d+\.\d+$/;
const noStore = { "cache-control": "private, no-store" };
const configuredRedirect = () => runtimeEnv().META_REDIRECT_URI?.trim() || "https://resolvflow.online/api/meta/callback";

async function activeTarget(accountUserId: string, workspaceOwnerUserId: string) {
  const [target] = await getDb().select({
    accountUserId: appUsers.id, userName: appUsers.displayName, userEmail: appUsers.email,
    workspaceOwnerUserId: workspaces.id, workspaceName: workspaces.name,
  }).from(workspaceMembers)
    .innerJoin(appUsers, or(eq(workspaceMembers.accountUserId, appUsers.id),
      and(isNull(workspaceMembers.accountUserId), sql`lower(${workspaceMembers.email}) = lower(${appUsers.email})`)))
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceOwnerUserId))
    .where(and(eq(appUsers.id, accountUserId), eq(workspaces.id, workspaceOwnerUserId),
      eq(appUsers.status, "active"), eq(workspaces.status, "active"), eq(workspaceMembers.status, "active"))).limit(1);
  return target || null;
}

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const db = getDb();
    const [apps, targetRows, assignmentRows] = await Promise.all([
      listMetaAppsForAdmin(),
      db.select({ accountUserId: appUsers.id, userName: appUsers.displayName, userEmail: appUsers.email,
        workspaceOwnerUserId: workspaces.id, workspaceName: workspaces.name })
        .from(workspaceMembers)
        .innerJoin(appUsers, or(eq(workspaceMembers.accountUserId, appUsers.id),
          and(isNull(workspaceMembers.accountUserId), sql`lower(${workspaceMembers.email}) = lower(${appUsers.email})`)))
        .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceOwnerUserId))
        .where(and(eq(workspaceMembers.status, "active"), eq(appUsers.status, "active"), eq(workspaces.status, "active")))
        .orderBy(asc(appUsers.displayName), asc(workspaces.name)),
      db.select({ id: metaAppAssignments.id, metaAppId: metaAppAssignments.metaAppId,
        accountUserId: metaAppAssignments.accountUserId, workspaceOwnerUserId: metaAppAssignments.workspaceOwnerUserId,
        userName: appUsers.displayName, userEmail: appUsers.email, workspaceName: workspaces.name,
        userStatus: appUsers.status, workspaceStatus: workspaces.status })
        .from(metaAppAssignments)
        .innerJoin(appUsers, eq(appUsers.id, metaAppAssignments.accountUserId))
        .innerJoin(workspaces, eq(workspaces.id, metaAppAssignments.workspaceOwnerUserId))
        .where(eq(metaAppAssignments.status, "active"))
        .orderBy(asc(appUsers.displayName), asc(workspaces.name)),
    ]);
    const seen = new Set<string>();
    const targets = targetRows.filter((row) => {
      const key = `${row.accountUserId}:${row.workspaceOwnerUserId}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    return Response.json({ apps: apps.map((app) => ({ ...app,
      assignments: assignmentRows.filter((row) => row.metaAppId === app.id) })),
      targets, redirectUri: configuredRedirect(), graphVersion: runtimeEnv().META_GRAPH_VERSION || "v26.0" },
    { headers: noStore });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: "Não foi possível carregar os Apps Meta." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requirePlatformAdmin(request);
    const payload = await request.json() as { label?: string; appId?: string; appSecret?: string };
    const label = String(payload.label || "").trim().slice(0, 100);
    const appId = String(payload.appId || "").trim();
    const appSecret = String(payload.appSecret || "").trim();
    if (!label || !APP_ID_PATTERN.test(appId) || appSecret.length < 12 || appSecret.length > 512) {
      return Response.json({ error: "Informe nome, App ID válido e App Secret." }, { status: 400 });
    }
    const graphVersion = runtimeEnv().META_GRAPH_VERSION || "v26.0";
    if (!GRAPH_VERSION_PATTERN.test(graphVersion)) return Response.json({ error: "Versão global da Graph API inválida." }, { status: 500 });
    const id = await createMetaApp({ label, appId, appSecret, graphVersion,
      redirectUri: configuredRedirect(), createdByUserId: context.accountUserId });
    await recordAuditEvent(request, { ownerUserId: context.workspaceOwnerUserId, action: "meta_app.create",
      entityType: "meta_app", entityId: id, summary: `App Meta “${label}” cadastrado no catálogo.`,
      metadata: { appId, graphVersion } });
    return Response.json({ saved: true, id }, { headers: noStore });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: "Não foi possível salvar o App Meta." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requirePlatformAdmin(request);
    const payload = await request.json() as { id?: string; action?: string; accountUserId?: string; workspaceOwnerUserId?: string; assignmentId?: string };
    const action = String(payload.action || "");
    const id = String(payload.id || "").trim();
    const db = getDb();
    if (action === "activate" || action === "disable") {
      if (!id) return Response.json({ error: "App inválido." }, { status: 400 });
      const status = action === "activate" ? "active" : "disabled";
      const updated = await setMetaAppStatus(id, status);
      if (!updated) return Response.json({ error: "App não encontrado." }, { status: 404 });
      await recordAuditEvent(request, { ownerUserId: context.workspaceOwnerUserId,
        action: `meta_app.${status}`, entityType: "meta_app", entityId: id,
        summary: `App Meta “${updated.label}” ${status === "active" ? "ativado" : "desativado"}.` });
      return Response.json({ updated: true, status }, { headers: noStore });
    }
    if (action === "assign") {
      const accountUserId = String(payload.accountUserId || "").trim();
      const workspaceOwnerUserId = String(payload.workspaceOwnerUserId || "").trim();
      const [apps, target] = await Promise.all([
        db.select({ id: metaApps.id, label: metaApps.label }).from(metaApps).where(eq(metaApps.id, id)).limit(1),
        activeTarget(accountUserId, workspaceOwnerUserId),
      ]);
      const app = apps[0];
      if (!app || !target) return Response.json({ error: "App ou vínculo ativo de usuário/workspace não encontrado." }, { status: 404 });
      const now = new Date().toISOString();
      const [assignment] = await db.insert(metaAppAssignments).values({ id: crypto.randomUUID(), metaAppId: app.id,
        accountUserId, workspaceOwnerUserId, status: "active", grantedAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: [metaAppAssignments.metaAppId, metaAppAssignments.accountUserId, metaAppAssignments.workspaceOwnerUserId],
          set: { status: "active", revokedAt: null, grantedAt: now, updatedAt: now } })
        .returning({ id: metaAppAssignments.id });
      await db.insert(metaAppUserPolicies).values({ accountUserId, workspaceOwnerUserId, managedAt: now }).onConflictDoNothing();
      await recordAuditEvent(request, { ownerUserId: workspaceOwnerUserId,
        action: "meta_app.assign", entityType: "meta_app_assignment", entityId: assignment.id,
        summary: `App Meta “${app.label}” atribuído a ${target.userEmail} em ${target.workspaceName}.`,
        metadata: { metaAppId: app.id, accountUserId, workspaceOwnerUserId } });
      return Response.json({ assigned: true, assignmentId: assignment.id }, { headers: noStore });
    }
    if (action === "revoke") {
      const assignmentId = String(payload.assignmentId || "").trim();
      const [assignment] = await db.select({ id: metaAppAssignments.id, metaAppId: metaAppAssignments.metaAppId,
        accountUserId: metaAppAssignments.accountUserId, workspaceOwnerUserId: metaAppAssignments.workspaceOwnerUserId,
        status: metaAppAssignments.status }).from(metaAppAssignments).where(eq(metaAppAssignments.id, assignmentId)).limit(1);
      if (!assignment || assignment.status !== "active") return Response.json({ error: "Atribuição ativa não encontrada." }, { status: 404 });
      await db.insert(metaAppUserPolicies).values({ accountUserId: assignment.accountUserId,
        workspaceOwnerUserId: assignment.workspaceOwnerUserId }).onConflictDoNothing();
      await db.update(metaAppAssignments).set({ status: "revoked", revokedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString() }).where(eq(metaAppAssignments.id, assignmentId));
      await recordAuditEvent(request, { ownerUserId: assignment.workspaceOwnerUserId,
        action: "meta_app.revoke", entityType: "meta_app_assignment", entityId: assignmentId,
        summary: "Atribuição de App Meta revogada para novas conexões.",
        metadata: { metaAppId: assignment.metaAppId, accountUserId: assignment.accountUserId,
          workspaceOwnerUserId: assignment.workspaceOwnerUserId } });
      return Response.json({ revoked: true }, { headers: noStore });
    }
    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: "Não foi possível atualizar o App Meta." }, { status: 500 });
  }
}
