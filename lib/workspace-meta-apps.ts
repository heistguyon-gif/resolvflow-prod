import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { metaAppAssignments, metaApps, metaAppUserPolicies, workspaceMetaApps } from "../db/schema";
import { decryptToken, encryptToken } from "./token-crypto";
import { metaConfig, type MetaAppKey } from "./runtime-env";
import { canUseLegacyMetaApp, chooseAssignedMetaApp } from "./meta-app-selection";

export type ResolvedMetaApp = {
  key: string;
  configured: boolean;
  appId: string;
  appSecret: string;
  graphVersion: string;
  redirectUri: string;
  encryptionKey: string;
  label: string;
  source: "workspace" | "catalog" | "legacy";
  workspaceOwnerUserId?: string;
  recordId?: string;
  status?: string;
};

type WorkspaceMetaAppRow = typeof workspaceMetaApps.$inferSelect;
type CanonicalMetaAppRow = typeof metaApps.$inferSelect;

export const workspaceMetaAppKey = (id: string) => `workspace:${id}`;
export const workspaceMetaAppIdFromKey = (key?: string | null) => {
  const value = String(key || "");
  return value.startsWith("workspace:") ? value.slice("workspace:".length) : null;
};

function legacyResolved(key: MetaAppKey | string): ResolvedMetaApp {
  const app = metaConfig(key);
  return { ...app, label: "App Meta da plataforma", source: "legacy" };
}

async function resolveWorkspaceRow(row: WorkspaceMetaAppRow): Promise<ResolvedMetaApp> {
  let secret = "";
  try {
    secret = await decryptToken(row.secretCiphertext, row.secretIv);
  } catch {
    secret = "";
  }
  const active = row.status === "active";
  return {
    key: workspaceMetaAppKey(row.id),
    configured: Boolean(active && row.appId && secret && row.graphVersion),
    appId: row.appId,
    appSecret: secret,
    graphVersion: row.graphVersion,
    redirectUri: row.redirectUri,
    encryptionKey: "",
    label: row.label,
    source: "workspace",
    workspaceOwnerUserId: row.workspaceOwnerUserId,
    recordId: row.id,
    status: row.status,
  };
}

async function resolveCanonicalRow(row: CanonicalMetaAppRow): Promise<ResolvedMetaApp> {
  let secret = "";
  try { secret = await decryptToken(row.secretCiphertext, row.secretIv); } catch { secret = ""; }
  return {
    key: workspaceMetaAppKey(row.id),
    configured: Boolean(row.status === "active" && row.appId && secret && row.graphVersion),
    appId: row.appId,
    appSecret: secret,
    graphVersion: row.graphVersion,
    redirectUri: row.redirectUri,
    encryptionKey: "",
    label: row.label,
    source: "catalog",
    recordId: row.id,
    status: row.status,
  };
}

async function managedTarget(accountUserId: string, workspaceOwnerUserId: string) {
  const [policy] = await getDb().select({ accountUserId: metaAppUserPolicies.accountUserId })
    .from(metaAppUserPolicies).where(and(eq(metaAppUserPolicies.accountUserId, accountUserId),
      eq(metaAppUserPolicies.workspaceOwnerUserId, workspaceOwnerUserId))).limit(1);
  return !canUseLegacyMetaApp(Boolean(policy), Boolean(await getWorkspaceMetaApp(workspaceOwnerUserId)));
}

async function assignedApps(accountUserId: string, workspaceOwnerUserId: string) {
  return getDb().select({ id: metaApps.id, label: metaApps.label, appId: metaApps.appId,
    status: metaApps.status }).from(metaAppAssignments)
    .innerJoin(metaApps, eq(metaApps.id, metaAppAssignments.metaAppId))
    .where(and(eq(metaAppAssignments.accountUserId, accountUserId),
      eq(metaAppAssignments.workspaceOwnerUserId, workspaceOwnerUserId),
      eq(metaAppAssignments.status, "active"))).orderBy(asc(metaApps.label));
}

export async function getWorkspaceMetaApp(workspaceOwnerUserId: string) {
  const [row] = await getDb().select().from(workspaceMetaApps)
    .where(eq(workspaceMetaApps.workspaceOwnerUserId, workspaceOwnerUserId)).limit(1);
  return row || null;
}

export async function isMetaWorkspaceManaged(workspaceOwnerUserId: string) {
  const [policy, dedicated, assignment] = await Promise.all([
    getDb().select({ accountUserId: metaAppUserPolicies.accountUserId }).from(metaAppUserPolicies)
      .where(eq(metaAppUserPolicies.workspaceOwnerUserId, workspaceOwnerUserId)).limit(1),
    getDb().select({ id: workspaceMetaApps.id }).from(workspaceMetaApps)
      .where(eq(workspaceMetaApps.workspaceOwnerUserId, workspaceOwnerUserId)).limit(1),
    getDb().select({ id: metaAppAssignments.id }).from(metaAppAssignments)
      .where(eq(metaAppAssignments.workspaceOwnerUserId, workspaceOwnerUserId)).limit(1),
  ]);
  return Boolean(policy.length || dedicated.length || assignment.length);
}

export async function resolveMetaAppForWorkspace(input: {
  accountUserId: string;
  workspaceOwnerUserId: string;
  requestedKey?: string | null;
  legacyKey: MetaAppKey | string;
}) {
  if (await managedTarget(input.accountUserId, input.workspaceOwnerUserId)) {
    const rows = await assignedApps(input.accountUserId, input.workspaceOwnerUserId);
    const selected = chooseAssignedMetaApp(rows, input.requestedKey);
    if (!selected) return null;
    const [row] = await getDb().select().from(metaApps).where(eq(metaApps.id, selected.id)).limit(1);
    return row ? resolveCanonicalRow(row) : null;
  }
  if (workspaceMetaAppIdFromKey(input.requestedKey)) return null;
  return legacyResolved(input.legacyKey);
}

export async function resolveMetaAppForStoredKey(key?: string | null) {
  const recordId = workspaceMetaAppIdFromKey(key);
  if (!recordId) return legacyResolved(key || "default");
  const [canonical] = await getDb().select().from(metaApps).where(eq(metaApps.id, recordId)).limit(1);
  if (canonical) return resolveCanonicalRow(canonical);
  const [legacy] = await getDb().select().from(workspaceMetaApps).where(eq(workspaceMetaApps.id, recordId)).limit(1);
  return legacy ? resolveWorkspaceRow(legacy) : null;
}

export async function publicMetaAppsForWorkspace(input: {
  accountUserId: string;
  workspaceOwnerUserId: string;
  legacy: Array<{ key: MetaAppKey | string; label: string }>;
}) {
  if (await managedTarget(input.accountUserId, input.workspaceOwnerUserId)) {
    const rows = await assignedApps(input.accountUserId, input.workspaceOwnerUserId);
    return rows.map((app) => ({ key: workspaceMetaAppKey(app.id), label: app.label,
      configured: app.status === "active", appId: app.appId, source: "catalog" as const, status: app.status }));
  }
  return input.legacy.map((app) => {
    const config = legacyResolved(app.key);
    return { key: config.key, label: app.label, configured: config.configured, appId: config.appId || null, source: config.source, status: "active" };
  });
}

export async function listMetaAppsForAdmin() {
  return getDb().select({
    id: metaApps.id, label: metaApps.label, appId: metaApps.appId,
    graphVersion: metaApps.graphVersion, redirectUri: metaApps.redirectUri,
    status: metaApps.status, createdAt: metaApps.createdAt, updatedAt: metaApps.updatedAt,
    createdSequence: sql<number>`${metaApps}.rowid`,
  }).from(metaApps).orderBy(desc(sql`julianday(${metaApps.createdAt})`), desc(sql`${metaApps}.rowid`));
}

export async function createMetaApp(input: {
  label: string; appId: string; appSecret: string; graphVersion: string; redirectUri: string; createdByUserId: string;
}) {
  const db = getDb();
  const [duplicate] = await db.select({ id: metaApps.id }).from(metaApps).where(eq(metaApps.appId, input.appId)).limit(1);
  if (duplicate) return null;
  const encrypted = await encryptToken(input.appSecret);
  const id = crypto.randomUUID();
  try {
    await db.insert(metaApps).values({ id, label: input.label, appId: input.appId,
      secretCiphertext: encrypted.ciphertext, secretIv: encrypted.iv, graphVersion: input.graphVersion,
      redirectUri: input.redirectUri, createdByUserId: input.createdByUserId });
  } catch (error) {
    if (error instanceof Error && error.message.includes("meta_app_id_already_exists")) return null;
    throw error;
  }
  return id;
}

export async function setMetaAppStatus(id: string, status: "active" | "disabled") {
  const rows = await getDb().update(metaApps).set({ status, updatedAt: new Date().toISOString() })
    .where(eq(metaApps.id, id)).returning({ id: metaApps.id, label: metaApps.label });
  return rows[0] || null;
}

export async function upsertWorkspaceMetaApp(input: {
  workspaceOwnerUserId: string;
  label: string;
  appId: string;
  appSecret: string;
  graphVersion: string;
  redirectUri: string;
  createdByUserId: string;
}) {
  const db = getDb();
  const now = new Date().toISOString();
  const encrypted = await encryptToken(input.appSecret);
  const existing = await getWorkspaceMetaApp(input.workspaceOwnerUserId);
  if (existing) {
    await db.update(workspaceMetaApps).set({
      label: input.label,
      appId: input.appId,
      secretCiphertext: encrypted.ciphertext,
      secretIv: encrypted.iv,
      graphVersion: input.graphVersion,
      redirectUri: input.redirectUri,
      status: "active",
      updatedAt: now,
    }).where(eq(workspaceMetaApps.id, existing.id));
    return existing.id;
  }
  const id = crypto.randomUUID();
  await db.insert(workspaceMetaApps).values({
    id,
    workspaceOwnerUserId: input.workspaceOwnerUserId,
    label: input.label,
    appId: input.appId,
    secretCiphertext: encrypted.ciphertext,
    secretIv: encrypted.iv,
    graphVersion: input.graphVersion,
    redirectUri: input.redirectUri,
    status: "active",
    createdByUserId: input.createdByUserId,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function setWorkspaceMetaAppStatus(id: string, status: "active" | "disabled") {
  const rows = await getDb().update(workspaceMetaApps).set({ status, updatedAt: new Date().toISOString() })
    .where(eq(workspaceMetaApps.id, id)).returning({ id: workspaceMetaApps.id, workspaceOwnerUserId: workspaceMetaApps.workspaceOwnerUserId, label: workspaceMetaApps.label });
  return rows[0] || null;
}
