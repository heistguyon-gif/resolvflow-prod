import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { connectionRequests } from "../../../../db/schema";
import { authErrorResponse, canDirectMetaConnect, isPlatformAdminEmail, requirePlatformAdmin, requireWorkspaceContext } from "../../../../lib/auth";
import { recordAuditEvent } from "../../../../lib/audit";
import { parseInstagramUsernames, serializeConnectionRequest, upsertConnectionRequest } from "../../../../lib/connection-queue";
import { metaAppKeyForWorkspace, metaAppKeysForWorkspace, metaAppLabel, normalizeMetaAppKey } from "../../../../lib/runtime-env";
import { publicMetaAppsForWorkspace, resolveMetaAppForWorkspace } from "../../../../lib/workspace-meta-apps";

function openStatuses() {
  return ["pending", "invited"] as const;
}

export async function GET(request: Request) {
  try {
    const ctx = await requireWorkspaceContext(request, "viewer");
    const admin = isPlatformAdminEmail(ctx.email);
    const direct = canDirectMetaConnect(ctx.email);
    const db = getDb();
    const mine = await db.select().from(connectionRequests).where(and(eq(connectionRequests.ownerUserId, ctx.workspaceOwnerUserId), inArray(connectionRequests.status, [...openStatuses()]))).orderBy(desc(connectionRequests.createdAt));
    const queue = admin
      ? await db.select().from(connectionRequests).where(inArray(connectionRequests.status, [...openStatuses()])).orderBy(connectionRequests.status, desc(connectionRequests.createdAt))
      : [];
    return Response.json({
      isPlatformAdmin: admin,
      canDirectConnect: direct,
      inviteUrl: "https://www.instagram.com/accounts/manage_access/",
      apps: await publicMetaAppsForWorkspace({
        workspaceOwnerUserId: ctx.workspaceOwnerUserId,
        legacy: metaAppKeysForWorkspace(ctx.workspaceOwnerUserId, admin).map((key) => ({ key, label: metaAppLabel(key) })),
      }),
      mine: mine.map(serializeConnectionRequest),
      queue: queue.map(serializeConnectionRequest),
    });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: "Não foi possível ler a fila de conexão." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspaceContext(request, "editor");
    const ready = canDirectMetaConnect(ctx.email);
    const payload = await request.json() as { usernames?: string | string[]; metaAppKey?: string };
    const parsed = parseInstagramUsernames(payload.usernames);
    if (!parsed.valid.length) return Response.json({ error: "Cole pelo menos um @ válido." }, { status: 400 });
    const metaApp = await resolveMetaAppForWorkspace({
      workspaceOwnerUserId: ctx.workspaceOwnerUserId,
      legacyKey: metaAppKeyForWorkspace(ctx.workspaceOwnerUserId, payload.metaAppKey, isPlatformAdminEmail(ctx.email)),
    });
    const metaAppKey = metaApp.key;
    const created: string[] = [];
    const skipped: string[] = [];
    for (const username of parsed.valid) {
      const result = await upsertConnectionRequest({
        ownerUserId: ctx.workspaceOwnerUserId,
        requestedByUserId: ctx.accountUserId,
        requestedByEmail: ctx.email,
        username,
        metaAppKey,
        ready,
      });
      if (result.skipped) skipped.push(username);
      else created.push(username);
    }
    if (created.length) {
      await recordAuditEvent(request, {
        ownerUserId: ctx.workspaceOwnerUserId,
        action: "connection_request.create",
        entityType: "connection_request",
        summary: `${created.length} perfil(is) na fila de conexão · ${metaAppKey}.`,
        metadata: { count: created.length, skipped: skipped.length },
      });
    }
    const mine = await getDb().select().from(connectionRequests).where(and(eq(connectionRequests.ownerUserId, ctx.workspaceOwnerUserId), inArray(connectionRequests.status, [...openStatuses()]))).orderBy(desc(connectionRequests.createdAt));
    return Response.json({
      created: created.length,
      skipped: skipped.length,
      invalid: parsed.invalid,
      mine: mine.map(serializeConnectionRequest),
    }, { status: created.length ? 201 : 200 });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: "Não foi possível pedir a conexão." }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as { action?: string; ids?: string[]; metaAppKey?: string; email?: string };
    const now = new Date().toISOString();
    const db = getDb();
    if (payload.action === "invite") {
      const ctx = await requirePlatformAdmin(request);
      const ids = [...new Set((payload.ids || []).map((value) => String(value || "").trim()).filter(Boolean))].slice(0, 80);
      if (!ids.length) return Response.json({ error: "Selecione pelo menos um perfil." }, { status: 400 });
      const updated = await db.update(connectionRequests).set({ status: "invited", invitedAt: now, invitedByEmail: ctx.email, updatedAt: now }).where(and(inArray(connectionRequests.id, ids), eq(connectionRequests.status, "pending"))).returning({ id: connectionRequests.id, username: connectionRequests.username, ownerUserId: connectionRequests.ownerUserId });
      if (updated.length) {
        await recordAuditEvent(request, {
          ownerUserId: ctx.workspaceOwnerUserId,
          action: "connection_request.invite",
          entityType: "connection_request",
          summary: `Convite liberado para ${updated.length} perfil(is).`,
          metadata: { count: updated.length },
        });
      }
      return Response.json({ updated: updated.length });
    }
    if (payload.action === "invite_user") {
      const ctx = await requirePlatformAdmin(request);
      const email = String(payload.email || "").trim().toLowerCase();
      if (!email || !email.includes("@")) return Response.json({ error: "Informe o usuário da fila." }, { status: 400 });
      const updated = await db.update(connectionRequests).set({ status: "invited", invitedAt: now, invitedByEmail: ctx.email, updatedAt: now }).where(and(eq(connectionRequests.requestedByEmail, email), eq(connectionRequests.status, "pending"))).returning({ id: connectionRequests.id });
      if (updated.length) {
        await recordAuditEvent(request, {
          ownerUserId: ctx.workspaceOwnerUserId,
          action: "connection_request.invite_user",
          entityType: "connection_request",
          summary: `Convite liberado para ${updated.length} perfil(is) de um usuário.`,
          metadata: { count: updated.length },
        });
      }
      return Response.json({ updated: updated.length });
    }
    if (payload.action === "invite_app") {
      const ctx = await requirePlatformAdmin(request);
      const requestedAppKey = String(payload.metaAppKey || "").trim();
      const metaAppKey = requestedAppKey.startsWith("workspace:") ? requestedAppKey : normalizeMetaAppKey(requestedAppKey);
      const updated = await db.update(connectionRequests).set({ status: "invited", invitedAt: now, invitedByEmail: ctx.email, updatedAt: now }).where(and(eq(connectionRequests.metaAppKey, metaAppKey), eq(connectionRequests.status, "pending"))).returning({ id: connectionRequests.id });
      if (updated.length) {
        await recordAuditEvent(request, {
          ownerUserId: ctx.workspaceOwnerUserId,
          action: "connection_request.invite_app",
          entityType: "connection_request",
          summary: `Convite liberado para ${updated.length} perfil(is) do app ${metaAppKey}.`,
          metadata: { count: updated.length, metaAppKey },
        });
      }
      return Response.json({ updated: updated.length });
    }
    if (payload.action === "cancel") {
      const ctx = await requireWorkspaceContext(request, "editor");
      const admin = isPlatformAdminEmail(ctx.email);
      const ids = [...new Set((payload.ids || []).map((value) => String(value || "").trim()).filter(Boolean))].slice(0, 80);
      if (!ids.length) return Response.json({ error: "Selecione pelo menos um perfil." }, { status: 400 });
      const filter = admin
        ? inArray(connectionRequests.id, ids)
        : and(inArray(connectionRequests.id, ids), eq(connectionRequests.ownerUserId, ctx.workspaceOwnerUserId));
      const updated = await db.update(connectionRequests).set({ status: "cancelled", updatedAt: now }).where(filter).returning({ id: connectionRequests.id });
      return Response.json({ updated: updated.length });
    }
    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: "Não foi possível atualizar a fila." }, { status: 502 });
  }
}
