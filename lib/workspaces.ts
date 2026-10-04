import { and, asc, eq, ne, or } from "drizzle-orm";
import { getDb } from "../db";
import { workspaceMembers, workspaces } from "../db/schema";
import { type MetaAppKey, metaAppLabel, metaConfig, normalizeMetaAppKey } from "./runtime-env";

export const OPERATION_2_WORKSPACE_ID = "nexoflow:operation_2";
export const OPERATION_3_WORKSPACE_ID = "nexoflow:operation_3";

export type WorkspaceRecord = {
  id: string;
  name: string;
  metaAppKey: MetaAppKey;
  status: string;
};

function toRecord(row: { id: string; name: string; metaAppKey: string; status: string }): WorkspaceRecord {
  return { id: row.id, name: row.name, metaAppKey: normalizeMetaAppKey(row.metaAppKey), status: row.status };
}

export async function getWorkspace(id: string): Promise<WorkspaceRecord | null> {
  const [row] = await getDb().select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
  return row ? toRecord(row) : null;
}

export async function listOwnedWorkspaces(accountUserId: string, email: string): Promise<WorkspaceRecord[]> {
  const db = getDb();
  const memberships = await db.select({
    id: workspaces.id,
    name: workspaces.name,
    metaAppKey: workspaces.metaAppKey,
    status: workspaces.status,
    role: workspaceMembers.role,
  }).from(workspaceMembers).innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceOwnerUserId)).where(and(
    or(eq(workspaceMembers.accountUserId, accountUserId), eq(workspaceMembers.email, email)),
    ne(workspaceMembers.status, "revoked"),
    eq(workspaceMembers.role, "owner"),
    eq(workspaces.status, "active"),
    or(eq(workspaces.id, accountUserId), eq(workspaces.id, `nexoflow:${email}`)),
  )).orderBy(asc(workspaces.createdAt));
  return memberships.map((row) => toRecord(row));
}

export async function ensureWorkspaceRow(id: string, name: string, metaAppKey: MetaAppKey, createdByUserId: string) {
  await getDb().insert(workspaces).values({ id, name, metaAppKey, createdByUserId, status: "active" }).onConflictDoNothing();
}

async function ensureOwnerMembership(workspaceId: string, context: { email: string; accountUserId: string; displayName: string }) {
  const db = getDb();
  const [existing] = await db.select({ id: workspaceMembers.id }).from(workspaceMembers).where(and(
    eq(workspaceMembers.workspaceOwnerUserId, workspaceId),
    or(eq(workspaceMembers.accountUserId, context.accountUserId), eq(workspaceMembers.email, context.email)),
  )).limit(1);
  if (existing) return;
  await db.insert(workspaceMembers).values({
    id: crypto.randomUUID(),
    workspaceOwnerUserId: workspaceId,
    accountUserId: context.accountUserId,
    email: context.email,
    displayName: context.displayName,
    role: "owner",
    status: "active",
    invitedByUserId: context.accountUserId,
  }).onConflictDoNothing();
}

export async function ensureSecondaryWorkspace(context: { role: string; email: string; accountUserId: string; displayName: string }) {
  if (context.role !== "owner") return;
  await ensureWorkspaceRow(context.accountUserId, context.displayName || "resolvflow", "default", context.accountUserId);
  await ensureOwnerMembership(context.accountUserId, context);
}

export async function workspaceMetaApp(ownerUserId: string) {
  const workspace = await getWorkspace(ownerUserId);
  return metaConfig(workspace?.metaAppKey || "default");
}

export { metaAppLabel };
