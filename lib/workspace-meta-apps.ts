import { asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { workspaceMetaApps } from "../db/schema";
import { decryptToken, encryptToken } from "./token-crypto";
import { metaConfig, type MetaAppKey } from "./runtime-env";

export type ResolvedMetaApp = {
  key: string;
  configured: boolean;
  appId: string;
  appSecret: string;
  graphVersion: string;
  redirectUri: string;
  encryptionKey: string;
  label: string;
  source: "workspace" | "legacy";
  workspaceOwnerUserId?: string;
  recordId?: string;
  status?: string;
};

type WorkspaceMetaAppRow = typeof workspaceMetaApps.$inferSelect;

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

export async function getWorkspaceMetaApp(workspaceOwnerUserId: string) {
  const [row] = await getDb().select().from(workspaceMetaApps)
    .where(eq(workspaceMetaApps.workspaceOwnerUserId, workspaceOwnerUserId)).limit(1);
  return row || null;
}

export async function resolveMetaAppForWorkspace(input: {
  workspaceOwnerUserId: string;
  legacyKey: MetaAppKey | string;
}) {
  const stored = await getWorkspaceMetaApp(input.workspaceOwnerUserId);
  return stored ? resolveWorkspaceRow(stored) : legacyResolved(input.legacyKey);
}

export async function resolveMetaAppForStoredKey(key?: string | null) {
  const recordId = workspaceMetaAppIdFromKey(key);
  if (!recordId) return legacyResolved(key || "default");
  const [row] = await getDb().select().from(workspaceMetaApps).where(eq(workspaceMetaApps.id, recordId)).limit(1);
  return row ? resolveWorkspaceRow(row) : null;
}

export async function publicMetaAppsForWorkspace(input: {
  workspaceOwnerUserId: string;
  legacy: Array<{ key: MetaAppKey | string; label: string }>;
}) {
  const stored = await getWorkspaceMetaApp(input.workspaceOwnerUserId);
  if (!stored) return input.legacy.map((app) => {
    const config = legacyResolved(app.key);
    return { key: config.key, label: app.label, configured: config.configured, appId: config.appId || null, source: config.source, status: "active" };
  });
  return [{ key: workspaceMetaAppKey(stored.id), label: stored.label, configured: stored.status === "active", appId: stored.appId, source: "workspace" as const, status: stored.status }];
}

export async function listWorkspaceMetaAppsForAdmin() {
  return getDb().select({
    id: workspaceMetaApps.id,
    workspaceOwnerUserId: workspaceMetaApps.workspaceOwnerUserId,
    label: workspaceMetaApps.label,
    appId: workspaceMetaApps.appId,
    graphVersion: workspaceMetaApps.graphVersion,
    redirectUri: workspaceMetaApps.redirectUri,
    status: workspaceMetaApps.status,
    createdAt: workspaceMetaApps.createdAt,
    updatedAt: workspaceMetaApps.updatedAt,
  }).from(workspaceMetaApps).orderBy(asc(workspaceMetaApps.label));
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
