import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { appUsers } from "../../../../../db/schema";
import { authErrorResponse, isPlatformAdminEmail, requirePlatformAdmin } from "../../../../../lib/auth";
import { canManagePlatformLogin, isPlatformOwnerEmail } from "../../../../../lib/platform-access";
import { hashPassword, validatePassword } from "../../../../../lib/passwords";
import { recordAuditEvent } from "../../../../../lib/audit";

export async function PATCH(request: Request) {
  try {
    const actor = await requirePlatformAdmin(request);
    const raw: unknown = await request.json().catch(() => null);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return Response.json({ error: "Dados de acesso inválidos." }, { status: 400 });
    }
    const payload = raw as Record<string, unknown>;
    if (typeof payload.userId !== "string") {
      return Response.json({ error: "Dados de acesso inválidos." }, { status: 400 });
    }
    if (Object.keys(payload).some((key) => !["userId", "password", "status"].includes(key))) {
      return Response.json({ error: "Campo de acesso inválido." }, { status: 400 });
    }
    const db = getDb();
    const [target] = await db.select({ id: appUsers.id, email: appUsers.email, status: appUsers.status }).from(appUsers).where(eq(appUsers.id, payload.userId)).limit(1);
    if (!target) return Response.json({ error: "Usuário não encontrado." }, { status: 404 });
    if (!canManagePlatformLogin(actor.email, target.email, isPlatformAdminEmail(target.email))) {
      return Response.json({ error: "Somente o proprietário pode gerenciar acessos administrativos." }, { status: 403 });
    }
    const changes: { passwordHash?: string; status?: string } = {};
    if (payload.password !== undefined) {
      if (typeof payload.password !== "string") return Response.json({ error: "Senha inválida." }, { status: 400 });
      const error = validatePassword(payload.password);
      if (error) return Response.json({ error }, { status: 400 });
      changes.passwordHash = await hashPassword(payload.password);
    }
    if (payload.status !== undefined) {
      if (typeof payload.status !== "string" || !["active", "disabled", "revoked"].includes(payload.status)) return Response.json({ error: "Status inválido." }, { status: 400 });
      if (isPlatformOwnerEmail(target.email) && payload.status !== "active") return Response.json({ error: "A conta do proprietário não pode ser bloqueada ou removida." }, { status: 403 });
      changes.status = payload.status;
    }
    if (!Object.keys(changes).length) return Response.json({ updated: false });
    await db.update(appUsers).set({ ...changes, sessionVersion: sql`${appUsers.sessionVersion} + 1`, updatedAt: new Date().toISOString() }).where(eq(appUsers.id, target.id));
    await recordAuditEvent(request, { ownerUserId: actor.workspaceOwnerUserId, action: "admin.login_update", entityType: "app_user", entityId: target.id, summary: `Acesso atualizado: ${[changes.passwordHash ? "senha" : "", changes.status ? `status ${changes.status}` : ""].filter(Boolean).join(", ")}. Sessões anteriores invalidadas.` });
    return Response.json({ updated: true, reloginRequired: actor.accountUserId === target.id });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: "Não foi possível atualizar o acesso." }, { status: 500 });
  }
}
