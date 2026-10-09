import { and, eq, ne, or } from "drizzle-orm";
import { getDb } from "../db";
import { workspaceMembers } from "../db/schema";
import { runtimeEnv } from "./runtime-env";
import { ensureWorkspaceRow } from "./workspaces";

export type WorkspaceRole = "owner" | "editor" | "viewer";
export type WorkspaceContext = {
  workspaceOwnerUserId: string;
  accountUserId: string;
  email: string;
  displayName: string;
  role: WorkspaceRole;
  mustChangePassword: boolean;
};

const roleRank: Record<WorkspaceRole, number> = { viewer: 1, editor: 2, owner: 3 };
const workspaceMemo = new Map<string, { exp: number; ctx: WorkspaceContext }>();

export class AuthenticationError extends Error {}
export class AuthorizationError extends Error {}

function requestIdentity(request: Request) {
  const accountUserId = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  const name = request.headers.get("oai-authenticated-user-full-name");
  if (accountUserId && email) return { accountUserId, email, displayName: name ? safeDecode(name) : email };
  const hostname = new URL(request.url).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") return { accountUserId: "local-preview", email: "local@nexoflow.dev", displayName: "Administrador local" };
  throw new AuthenticationError("Entre na resolv. para continuar.");
}

function safeDecode(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function assertRole(actual: WorkspaceRole, required: WorkspaceRole) {
  if (roleRank[actual] < roleRank[required]) throw new AuthorizationError("Seu acesso é somente leitura. Peça ao administrador para liberar esta ação.");
}

function isSiloWorkspace(id: string, accountUserId: string, email: string) {
  if (id === accountUserId || id === `nexoflow:${email}`) return false;
  if (id === "nexoflow:operation_2" || id === "nexoflow:operation_3") return true;
  return id.endsWith(":mk1") || id.endsWith(":mk2");
}

export async function requireWorkspaceContext(request: Request, requiredRole: WorkspaceRole = "viewer"): Promise<WorkspaceContext> {
  const identity = requestIdentity(request);
  const mustChangePassword = request.headers.get("nexoflow-must-change-password") === "true";
  const memoKey = `${identity.accountUserId}|${identity.email}`;
  const memo = workspaceMemo.get(memoKey);
  if (memo && memo.exp > Date.now()) {
    assertRole(memo.ctx.role, requiredRole);
    return { ...memo.ctx, displayName: identity.displayName, mustChangePassword };
  }
  const db = getDb();
  const members = await db.select({
    id: workspaceMembers.id,
    workspaceOwnerUserId: workspaceMembers.workspaceOwnerUserId,
    accountUserId: workspaceMembers.accountUserId,
    email: workspaceMembers.email,
    role: workspaceMembers.role,
    status: workspaceMembers.status,
  }).from(workspaceMembers).where(and(
    or(eq(workspaceMembers.accountUserId, identity.accountUserId), eq(workspaceMembers.email, identity.email)),
    ne(workspaceMembers.status, "revoked"),
  )).limit(20);
  const usable = members.filter((item) => !isSiloWorkspace(item.workspaceOwnerUserId, identity.accountUserId, identity.email));
  const member = usable.find((item) => item.workspaceOwnerUserId === identity.accountUserId)
    || usable.find((item) => item.workspaceOwnerUserId === `nexoflow:${identity.email}`)
    || usable.find((item) => item.role === "owner")
    || usable[0];
  if (member) {
    const role = member.role as WorkspaceRole;
    assertRole(role, requiredRole);
    if (!member.accountUserId || member.status === "invited") {
      await db.update(workspaceMembers).set({ accountUserId: identity.accountUserId, displayName: identity.displayName, status: "active", updatedAt: new Date().toISOString() }).where(eq(workspaceMembers.id, member.id));
    }
    const ctx = { workspaceOwnerUserId: member.workspaceOwnerUserId, accountUserId: identity.accountUserId, email: identity.email, displayName: identity.displayName, role, mustChangePassword };
    if (workspaceMemo.size > 200) workspaceMemo.clear();
    workspaceMemo.set(memoKey, { exp: Date.now() + 45_000, ctx });
    return ctx;
  }

  const canBootstrap = identity.accountUserId === "local-preview" || isPlatformAdminEmail(identity.email);
  if (!canBootstrap) throw new AuthorizationError("Este login ainda não foi convidado para a operação resolv.");

  await db.insert(workspaceMembers).values({ id: crypto.randomUUID(), workspaceOwnerUserId: identity.accountUserId, accountUserId: identity.accountUserId, email: identity.email, displayName: identity.displayName, role: "owner", status: "active", invitedByUserId: identity.accountUserId }).onConflictDoNothing();
  await ensureWorkspaceRow(identity.accountUserId, "Operação MK", "default", identity.accountUserId);
  const [created] = await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.email, identity.email), eq(workspaceMembers.status, "active"))).limit(1);
  if (!created) throw new AuthorizationError("Não foi possível preparar o espaço compartilhado.");
  assertRole(created.role as WorkspaceRole, requiredRole);
  return { workspaceOwnerUserId: created.workspaceOwnerUserId, accountUserId: identity.accountUserId, email: identity.email, displayName: identity.displayName, role: created.role as WorkspaceRole, mustChangePassword };
}

function configuredPlatformAdminEmails() {
  const values = runtimeEnv();
  return new Set([values.NEXOFLOW_OWNER_EMAIL, values.NEXOFLOW_ADMIN_EMAILS]
    .flatMap((value) => (value || "").split(","))
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean));
}

export function isPlatformAdminEmail(email?: string | null) {
  const normalized = email?.trim().toLowerCase();
  return Boolean(normalized && configuredPlatformAdminEmails().has(normalized));
}

export function canDirectMetaConnect(email?: string | null) {
  const normalized = email?.trim().toLowerCase() || "";
  return Boolean(normalized);
}

export function canSeeRanking(email?: string | null) {
  const normalized = email?.trim().toLowerCase() || "";
  return Boolean(normalized && isPlatformAdminEmail(normalized));
}

export async function requirePlatformAdmin(request: Request) {
  const ctx = await requireWorkspaceContext(request, "viewer");
  if (!isPlatformAdminEmail(ctx.email)) throw new AuthorizationError("Sem permissão.");
  return ctx;
}

export async function requireOwnerId(request: Request, requiredRole: WorkspaceRole = "editor") {
  return (await requireWorkspaceContext(request, requiredRole)).workspaceOwnerUserId;
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthenticationError) return Response.json({ error: error.message }, { status: 401 });
  if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
  return null;
}
