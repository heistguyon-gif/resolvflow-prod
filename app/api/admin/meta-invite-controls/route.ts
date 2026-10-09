import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { connectionRequests, metaConnectionModes, metaInvitePlatformSettings } from "../../../../db/schema";
import { authErrorResponse, requirePlatformAdmin } from "../../../../lib/auth";
import { recordAuditEvent } from "../../../../lib/audit";
import { isBotInviteEnabled } from "../../../../lib/meta-invite-controls";
import { ACTIVE_INVITE_MEMBER_SQL } from "../../../../lib/meta-invite-membership";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    return Response.json({ enabled: await isBotInviteEnabled() }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return authErrorResponse(error) || Response.json({ error: "Não foi possível ler a configuração." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requirePlatformAdmin(request);
    const body = await request.json() as Record<string, unknown>;
    const now = new Date().toISOString();
    const db = getDb();
    if (body.scope === "platform" && typeof body.enabled === "boolean") {
      await db.insert(metaInvitePlatformSettings).values({ key: "bot_invite", enabled: body.enabled, updatedAt: now })
        .onConflictDoUpdate({ target: metaInvitePlatformSettings.key, set: { enabled: body.enabled, updatedAt: now } });
      if (!body.enabled) await db.update(connectionRequests).set({ status: "pending", inviteClaimToken: null, inviteLeaseUntil: null, updatedAt: now })
        .where(and(eq(connectionRequests.inviteMode, "automatic"), eq(connectionRequests.status, "processing")));
      await recordAuditEvent(request, { ownerUserId: ctx.workspaceOwnerUserId,
        action: "meta_invite.platform_toggle", entityType: "meta_invite_platform_settings", entityId: "bot_invite",
        summary: `Bot de convite ${body.enabled ? "ligado" : "desligado"}.`, metadata: { enabled: body.enabled } });
      return Response.json({ enabled: body.enabled });
    }
    if (body.scope === "workspace" && (body.mode === "standard" || body.mode === "bot")) {
      const accountUserId = String(body.accountUserId || "");
      const workspaceOwnerUserId = String(body.workspaceOwnerUserId || "");
      if (!accountUserId || !workspaceOwnerUserId) return Response.json({ error: "Pessoa e workspace são obrigatórios." }, { status: 400 });
      const member = await env.DB.prepare(ACTIVE_INVITE_MEMBER_SQL).bind(accountUserId, workspaceOwnerUserId).first<{ id: string }>();
      if (!member) return Response.json({ error: "Vínculo ativo não encontrado." }, { status: 404 });
      await db.insert(metaConnectionModes).values({ accountUserId, workspaceOwnerUserId, mode: body.mode, updatedAt: now })
        .onConflictDoUpdate({ target: [metaConnectionModes.accountUserId, metaConnectionModes.workspaceOwnerUserId],
          set: { mode: body.mode, updatedAt: now } });
      if (body.mode === "standard") await db.update(connectionRequests).set({ status: "pending", inviteClaimToken: null, inviteLeaseUntil: null, updatedAt: now })
        .where(and(eq(connectionRequests.requestedByUserId, accountUserId), eq(connectionRequests.ownerUserId, workspaceOwnerUserId),
          eq(connectionRequests.inviteMode, "automatic"), eq(connectionRequests.status, "processing")));
      await recordAuditEvent(request, { ownerUserId: workspaceOwnerUserId,
        action: "meta_invite.connection_mode", entityType: "meta_connection_mode", entityId: `${accountUserId}:${workspaceOwnerUserId}`,
        summary: `Forma de conexão definida como ${body.mode === "bot" ? "Bot" : "Padrão"}.`, metadata: { accountUserId, mode: body.mode } });
      return Response.json({ mode: body.mode });
    }
    return Response.json({ error: "Configuração inválida." }, { status: 400 });
  } catch (error) {
    return authErrorResponse(error) || Response.json({ error: "Não foi possível salvar a configuração." }, { status: 500 });
  }
}
