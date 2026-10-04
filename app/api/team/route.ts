import { and, asc, eq, ne, or, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { appUsers, workspaceMembers, workspaces } from "../../../db/schema";
import { authErrorResponse, canSeeRanking, isPlatformAdminEmail, requirePlatformAdmin, requireWorkspaceContext, type WorkspaceRole } from "../../../lib/auth";
import { hashPassword, validatePassword } from "../../../lib/passwords";
import { recordAuditEvent } from "../../../lib/audit";
import { ensureWorkspaceRow } from "../../../lib/workspaces";
import { metaAppKeyForWorkspace, metaAppLabel } from "../../../lib/runtime-env";

const validRoles = new Set<WorkspaceRole>(["editor", "viewer"]);

function memberSelect() {
  return {
    id: workspaceMembers.id,
    accountUserId: workspaceMembers.accountUserId,
    email: workspaceMembers.email,
    displayName: workspaceMembers.displayName,
    role: workspaceMembers.role,
    status: workspaceMembers.status,
    createdAt: workspaceMembers.createdAt,
    lastLoginAt: appUsers.lastLoginAt,
    mustChangePassword: appUsers.mustChangePassword,
    avatarMediaId: appUsers.avatarMediaId,
  };
}

function avatarUrl(id: string | null | undefined) {
  return id ? `/api/profile/avatar/${id}` : null;
}

function flag(value: boolean | number | null | undefined) {
  return value !== false && value !== 0;
}

export async function GET(request: Request) {
  try {
    const context = await requireWorkspaceContext(request, "viewer");
    const platformAdmin = isPlatformAdminEmail(context.email);
    const db = getDb();
    const [profile] = await db.select({
      displayName: appUsers.displayName,
      avatarMediaId: appUsers.avatarMediaId,
      notifyPublish: appUsers.notifyPublish,
      notifyErrors: appUsers.notifyErrors,
      notifyConnections: appUsers.notifyConnections,
      mustChangePassword: appUsers.mustChangePassword,
    }).from(appUsers).where(eq(appUsers.id, context.accountUserId)).limit(1);
    const members = platformAdmin
      ? await db.select(memberSelect()).from(workspaceMembers).leftJoin(appUsers, eq(workspaceMembers.accountUserId, appUsers.id)).where(eq(workspaceMembers.workspaceOwnerUserId, context.workspaceOwnerUserId)).orderBy(asc(workspaceMembers.createdAt))
      : [];
    const independentWorkspaces = platformAdmin
      ? await db.select({ ...memberSelect(), metaAppKey: workspaces.metaAppKey, workspaceId: workspaceMembers.workspaceOwnerUserId }).from(workspaceMembers).leftJoin(appUsers, eq(workspaceMembers.accountUserId, appUsers.id)).leftJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceOwnerUserId)).where(and(eq(workspaceMembers.invitedByUserId, context.accountUserId), eq(workspaceMembers.role, "owner"), ne(workspaceMembers.workspaceOwnerUserId, context.workspaceOwnerUserId))).orderBy(asc(workspaceMembers.createdAt))
      : [];
    const withAvatars = <T extends { avatarMediaId?: string | null }>(rows: T[]) => rows.map((member) => ({ ...member, avatarUrl: avatarUrl(member.avatarMediaId) }));
    return Response.json({
      currentUser: {
        email: context.email,
        displayName: profile?.displayName || context.displayName,
        role: context.role,
        isPlatformAdmin: platformAdmin,
        canSeeRanking: canSeeRanking(context.email),
        mustChangePassword: profile?.mustChangePassword ?? context.mustChangePassword,
        avatarUrl: avatarUrl(profile?.avatarMediaId),
        notifyPublish: profile ? flag(profile.notifyPublish) : true,
        notifyErrors: profile ? flag(profile.notifyErrors) : true,
        notifyConnections: profile ? flag(profile.notifyConnections) : true,
      },
      members: withAvatars(members),
      independentWorkspaces: withAvatars(independentWorkspaces),
    });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar a equipe." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requirePlatformAdmin(request);
    const payload = await request.json() as { email?: string; displayName?: string; password?: string; role?: WorkspaceRole; workspaceKind?: "shared" | "independent"; metaAppKey?: string };
    const email = payload.email?.trim().toLowerCase() || "";
    const displayName = payload.displayName?.trim().slice(0, 120) || "";
    const password = payload.password || "";
    const independent = payload.workspaceKind === "independent";
    const role: WorkspaceRole = independent ? "owner" : (payload.role || "editor");
    if (!/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
    if (!displayName) return Response.json({ error: "Informe o nome da pessoa." }, { status: 400 });
    const passwordError = validatePassword(password); if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
    if (!independent && !validRoles.has(role)) return Response.json({ error: "Papel de acesso inválido." }, { status: 400 });
    if (email === context.email) return Response.json({ error: independent ? "Este e-mail já é o administrador desta operação." : "Seu login já é o administrador da operação." }, { status: 409 });
    const db = getDb();
    const [existingUser] = await db.select({ id: appUsers.id }).from(appUsers).where(eq(appUsers.email, email)).limit(1);
    const [existingMember] = await db.select({ id: workspaceMembers.id, accountUserId: workspaceMembers.accountUserId, workspaceOwnerUserId: workspaceMembers.workspaceOwnerUserId }).from(workspaceMembers).where(eq(workspaceMembers.email, email)).limit(1);
    if (existingUser || existingMember) return Response.json({ error: "Este e-mail já possui um acesso na resolv.." }, { status: 409 });
    const userId = crypto.randomUUID();
    const metaAppKey = independent ? metaAppKeyForWorkspace(userId, payload.metaAppKey) : "default";
    const passwordHash = await hashPassword(password);
    const workspaceOwnerUserId = independent ? userId : context.workspaceOwnerUserId;
    await db.insert(appUsers).values({ id: userId, email, passwordHash, displayName, status: "active", mustChangePassword: true, createdByUserId: context.accountUserId });
    await db.insert(workspaceMembers).values({ id: crypto.randomUUID(), workspaceOwnerUserId, accountUserId: userId, email, displayName, role, status: "active", invitedByUserId: context.accountUserId });
    if (independent) await ensureWorkspaceRow(userId, displayName, metaAppKey, context.accountUserId);
    await recordAuditEvent(request, { ownerUserId: context.workspaceOwnerUserId, action: independent ? "team.independent_workspace" : "team.member_upsert", entityType: "team_member", entityId: userId, summary: independent ? `Conta independente criada para ${email}. Nenhum dado desta operação foi compartilhado.` : `Acesso de ${email} criado ou atualizado como ${role}.` });
    return Response.json({ created: true, email, displayName, role, workspaceKind: independent ? "independent" : "shared", metaAppKey }, { status: 201 });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível convidar esta pessoa." }, { status: 500 });
  }
}

async function findManagedMember(memberId: string, context: { workspaceOwnerUserId: string; accountUserId: string }) {
  const [member] = await getDb().select().from(workspaceMembers).where(and(
    eq(workspaceMembers.id, memberId),
    or(
      eq(workspaceMembers.workspaceOwnerUserId, context.workspaceOwnerUserId),
      and(eq(workspaceMembers.invitedByUserId, context.accountUserId), eq(workspaceMembers.role, "owner"), ne(workspaceMembers.workspaceOwnerUserId, context.workspaceOwnerUserId)),
    ),
  )).limit(1);
  return member;
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as { action?: "change_own_password" | "reset_password" | "update_member" | "set_meta_app" | "update_own_profile"; memberId?: string; displayName?: string; role?: WorkspaceRole; password?: string; metaAppKey?: string; notifyPublish?: boolean; notifyErrors?: boolean; notifyConnections?: boolean };
    const personalAction = payload.action === "change_own_password" || payload.action === "update_own_profile";
    const context = personalAction
      ? await requireWorkspaceContext(request, "viewer")
      : await requirePlatformAdmin(request);
    const db = getDb();
    const passwordError = payload.password !== undefined ? validatePassword(payload.password) : "";
    if (passwordError) return Response.json({ error: passwordError }, { status: 400 });

    if (payload.action === "change_own_password") {
      if (!payload.password) return Response.json({ error: "Informe a nova senha." }, { status: 400 });
      const passwordHash = await hashPassword(payload.password);
      const updated = await db.update(appUsers).set({ passwordHash, mustChangePassword: false, sessionVersion: sql`${appUsers.sessionVersion} + 1`, updatedAt: new Date().toISOString() }).where(eq(appUsers.id, context.accountUserId)).returning({ id: appUsers.id });
      if (!updated.length) return Response.json({ error: "Seu usuário ainda não está cadastrado no login próprio da resolv.." }, { status: 409 });
      await recordAuditEvent(request, { ownerUserId: context.workspaceOwnerUserId, action: "team.password_change", entityType: "team_member", entityId: context.accountUserId, summary: "Senha do próprio acesso alterada; sessões anteriores invalidadas." });
      return Response.json({ updated: true, reloginRequired: true });
    }

    if (payload.action === "update_own_profile") {
      const displayName = payload.displayName?.trim().slice(0, 120) || "";
      if (!displayName) return Response.json({ error: "Informe o nome de usuário." }, { status: 400 });
      const now = new Date().toISOString();
      const updated = await db.update(appUsers).set({
        displayName,
        notifyPublish: payload.notifyPublish !== false,
        notifyErrors: payload.notifyErrors !== false,
        notifyConnections: payload.notifyConnections !== false,
        updatedAt: now,
      }).where(eq(appUsers.id, context.accountUserId)).returning({ id: appUsers.id });
      if (!updated.length) return Response.json({ error: "Seu usuário ainda não está cadastrado no login próprio da resolv." }, { status: 409 });
      await db.update(workspaceMembers).set({ displayName, updatedAt: now }).where(eq(workspaceMembers.accountUserId, context.accountUserId));
      await recordAuditEvent(request, { ownerUserId: context.workspaceOwnerUserId, action: "profile.update", entityType: "team_member", entityId: context.accountUserId, summary: "Perfil pessoal atualizado." });
      return Response.json({
        updated: true,
        displayName,
        notifyPublish: payload.notifyPublish !== false,
        notifyErrors: payload.notifyErrors !== false,
        notifyConnections: payload.notifyConnections !== false,
      });
    }

    const member = await findManagedMember(payload.memberId || "", context);
    const independent = Boolean(member && member.workspaceOwnerUserId !== context.workspaceOwnerUserId);
    if (!member || (!independent && member.role === "owner") || !member.accountUserId) return Response.json({ error: "Membro não encontrado ou protegido." }, { status: 404 });

    if (payload.action === "reset_password") {
      if (!payload.password) return Response.json({ error: "Informe a senha temporária." }, { status: 400 });
      const passwordHash = await hashPassword(payload.password);
      await db.update(appUsers).set({ passwordHash, mustChangePassword: true, sessionVersion: sql`${appUsers.sessionVersion} + 1`, status: "active", updatedAt: new Date().toISOString() }).where(eq(appUsers.id, member.accountUserId));
      await recordAuditEvent(request, { ownerUserId: context.workspaceOwnerUserId, action: "team.password_reset", entityType: "team_member", entityId: member.accountUserId, summary: `Senha temporária redefinida para ${member.email}; sessões anteriores invalidadas.` });
      return Response.json({ reset: true });
    }

    if (payload.action === "update_member") {
      if (independent) return Response.json({ error: "Uma conta independente não pode ser rebaixada para a sua operação." }, { status: 409 });
      const role = payload.role || (member.role as WorkspaceRole);
      const displayName = payload.displayName?.trim().slice(0, 120) || member.displayName || member.email;
      if (!validRoles.has(role)) return Response.json({ error: "Papel de acesso inválido." }, { status: 400 });
      await db.update(workspaceMembers).set({ displayName, role, updatedAt: new Date().toISOString() }).where(eq(workspaceMembers.id, member.id));
      await db.update(appUsers).set({ displayName, updatedAt: new Date().toISOString() }).where(eq(appUsers.id, member.accountUserId));
      await recordAuditEvent(request, { ownerUserId: context.workspaceOwnerUserId, action: "team.member_update", entityType: "team_member", entityId: member.accountUserId, summary: `Acesso de ${member.email} atualizado para ${role}.` });
      return Response.json({ updated: true });
    }

    if (payload.action === "set_meta_app") {
      if (!independent) return Response.json({ error: "Só contas independentes trocam de app Meta." }, { status: 409 });
      const metaAppKey = metaAppKeyForWorkspace(member.workspaceOwnerUserId, payload.metaAppKey);
      await ensureWorkspaceRow(member.workspaceOwnerUserId, metaAppLabel(metaAppKey), metaAppKey, context.accountUserId);
      await db.update(workspaces).set({ metaAppKey, name: metaAppLabel(metaAppKey), updatedAt: new Date().toISOString() }).where(eq(workspaces.id, member.workspaceOwnerUserId));
      await recordAuditEvent(request, { ownerUserId: member.workspaceOwnerUserId, action: "workspace.meta_app", entityType: "workspace", entityId: member.workspaceOwnerUserId, summary: `App Meta da operação de ${member.email} definido como ${metaAppLabel(metaAppKey)}.` });
      return Response.json({ updated: true, metaAppKey });
    }
    return Response.json({ error: "Ação de equipe inválida." }, { status: 400 });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar este acesso." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requirePlatformAdmin(request);
    const id = new URL(request.url).searchParams.get("id") || "";
    const member = await findManagedMember(id, context);
    if (!member) return Response.json({ error: "Membro não encontrado." }, { status: 404 });
    if (member.role === "owner" && member.workspaceOwnerUserId === context.workspaceOwnerUserId) return Response.json({ error: "O administrador principal não pode ser removido." }, { status: 409 });
    await getDb().update(workspaceMembers).set({ status: "revoked", updatedAt: new Date().toISOString() }).where(eq(workspaceMembers.id, member.id));
    if (member.accountUserId) await getDb().update(appUsers).set({ status: "disabled", sessionVersion: sql`${appUsers.sessionVersion} + 1`, updatedAt: new Date().toISOString() }).where(eq(appUsers.id, member.accountUserId));
    await recordAuditEvent(request, { ownerUserId: context.workspaceOwnerUserId, action: "team.member_revoke", entityType: "team_member", entityId: member.accountUserId, summary: `Acesso de ${member.email} revogado.` });
    return Response.json({ revoked: true });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível remover o acesso." }, { status: 500 });
  }
}
