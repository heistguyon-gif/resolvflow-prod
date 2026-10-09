import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, connectionRequests } from "../db/schema";
import { metaAppLabel, normalizeMetaAppKey } from "./runtime-env";

export const INSTAGRAM_TESTER_INVITE_URL = "https://www.instagram.com/accounts/manage_access/";
const USERNAME_RE = /^[a-z0-9._]{1,30}$/;

export function parseInstagramUsernames(raw: string | string[] | undefined) {
  const values = Array.isArray(raw) ? raw : String(raw || "").split(/[\s,;]+/);
  const unique = [...new Set(values.map((value) => String(value || "").replace(/^@/, "").trim().toLowerCase()).filter(Boolean))];
  const valid = unique.filter((username) => USERNAME_RE.test(username));
  return { valid: valid.slice(0, 50), invalid: unique.length - valid.length, truncated: Math.max(0, unique.length - 50) };
}

export function serializeConnectionRequest(row: typeof connectionRequests.$inferSelect) {
  const workspaceApp = row.metaAppKey.startsWith("workspace:");
  return {
    id: row.id,
    username: row.username,
    metaAppKey: workspaceApp ? row.metaAppKey : normalizeMetaAppKey(row.metaAppKey),
    metaAppLabel: workspaceApp ? "App exclusivo" : metaAppLabel(row.metaAppKey),
    status: row.status,
    inviteMode: row.inviteMode,
    inviteLastError: row.inviteLastError,
    requestedByEmail: row.requestedByEmail,
    invitedAt: row.invitedAt,
    connectedAt: row.connectedAt,
    createdAt: row.createdAt,
  };
}

export async function markConnectionRequestsConnected(ownerUserId: string, usernames: string[]) {
  const valid = [...new Set(usernames.map((value) => value.replace(/^@/, "").trim().toLowerCase()).filter(Boolean))];
  if (!valid.length) return;
  const now = new Date().toISOString();
  await getDb().update(connectionRequests).set({ status: "connected", connectedAt: now, updatedAt: now }).where(and(eq(connectionRequests.ownerUserId, ownerUserId), inArray(connectionRequests.username, valid)));
}

export async function ensureVaultAccount(ownerUserId: string, username: string) {
  const now = new Date().toISOString();
  await getDb().insert(accounts).values({
    id: crypto.randomUUID(),
    ownerUserId,
    username,
    healthStatus: "Desconhecida",
    connectionStatus: "Não verificada",
    source: "manual",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing({ target: [accounts.ownerUserId, accounts.username] });
}

export async function upsertConnectionRequest(input: {
  ownerUserId: string;
  requestedByUserId: string;
  requestedByEmail: string;
  username: string;
  metaAppKey: string;
  ready?: boolean;
}) {
  const db = getDb();
  const now = new Date().toISOString();
  const status = input.ready ? "invited" : "pending";
  const [existing] = await db.select().from(connectionRequests).where(and(eq(connectionRequests.ownerUserId, input.ownerUserId), eq(connectionRequests.username, input.username))).limit(1);
  if (existing?.inviteMode === "automatic") return { row: existing, created: false, skipped: true };
  if (existing?.status === "pending" || existing?.status === "invited") return { row: existing, created: false, skipped: true };
  await ensureVaultAccount(input.ownerUserId, input.username);
  if (existing) {
    const [updated] = await db.update(connectionRequests).set({
      requestedByUserId: input.requestedByUserId,
      requestedByEmail: input.requestedByEmail,
      metaAppKey: input.metaAppKey,
      status,
      invitedAt: input.ready ? now : null,
      invitedByEmail: input.ready ? input.requestedByEmail : null,
      connectedAt: null,
      updatedAt: now,
    }).where(eq(connectionRequests.id, existing.id)).returning();
    return { row: updated, created: false, skipped: false };
  }
  const [created] = await db.insert(connectionRequests).values({
    id: crypto.randomUUID(),
    ownerUserId: input.ownerUserId,
    requestedByUserId: input.requestedByUserId,
    requestedByEmail: input.requestedByEmail,
    username: input.username,
    metaAppKey: input.metaAppKey,
    status,
    invitedAt: input.ready ? now : null,
    invitedByEmail: input.ready ? input.requestedByEmail : null,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return { row: created, created: true, skipped: false };
}
