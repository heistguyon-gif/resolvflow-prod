import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "../db";
import { metaAppAssignments, metaApps, metaAppUserPolicies, metaConnections } from "../db/schema";
import { decryptToken, encryptToken } from "./token-crypto";
import { runtimeEnv } from "./runtime-env";
import { connectionHealth, generateVerifyToken, metaAppSetup, type ConnectionHealth, type MetaAppInput, type MetaAppSetup } from "./meta-app-registry";
import { workspaceMetaAppKey } from "./workspace-meta-apps";

export type OwnMetaAppView = {
  id: string;
  key: string;
  label: string;
  appId: string;
  status: string;
  createdAt: string;
  health: ConnectionHealth;
  setup: MetaAppSetup;
};

const DEFAULT_GRAPH_VERSION = "v26.0";

async function decryptOrNull(ciphertext: string | null, iv: string | null) {
  if (!ciphertext || !iv) return null;
  try { return await decryptToken(ciphertext, iv); } catch { return null; }
}

/** Apps registered by members of this workspace, with per-app profile health. */
export async function listOwnMetaApps(workspaceOwnerUserId: string, options: { revealVerifyToken: boolean; origin?: string }): Promise<OwnMetaAppView[]> {
  const db = getDb();
  const rows = await db.select().from(metaApps)
    .where(and(eq(metaApps.origin, "user"), eq(metaApps.ownerWorkspaceUserId, workspaceOwnerUserId)))
    .orderBy(asc(metaApps.label));
  if (!rows.length) return [];
  const keys = rows.map((row) => workspaceMetaAppKey(row.id));
  const connections = await db.select({ key: metaConnections.metaAppKey, status: metaConnections.status, tokenExpiresAt: metaConnections.tokenExpiresAt })
    .from(metaConnections)
    .where(and(eq(metaConnections.ownerUserId, workspaceOwnerUserId), inArray(metaConnections.metaAppKey, keys), ne(metaConnections.status, "archived")));
  const now = Date.now();
  return Promise.all(rows.map(async (row) => {
    const key = workspaceMetaAppKey(row.id);
    const token = options.revealVerifyToken ? await decryptOrNull(row.webhookVerifyTokenCiphertext, row.webhookVerifyTokenIv) : null;
    return {
      id: row.id, key, label: row.label, appId: row.appId, status: row.status, createdAt: row.createdAt,
      health: connectionHealth(connections.filter((item) => item.key === key), now),
      setup: metaAppSetup(row.id, token, options.origin),
    };
  }));
}

export type RegisterResult = { ok: true; id: string } | { ok: false; status: number; error: string };

/**
 * Registers an app for this workspace: stores it in meta_apps (secret + verify token
 * AES-GCM encrypted with TOKEN_ENCRYPTION_KEY), assigns it to the registering member and
 * to the workspace owner, and marks both as "managed" so connections only use real apps.
 */
export async function registerOwnMetaApp(input: MetaAppInput & { accountUserId: string; workspaceOwnerUserId: string; origin: string }): Promise<RegisterResult> {
  const db = getDb();
  const [duplicate] = await db.select({ id: metaApps.id }).from(metaApps).where(eq(metaApps.appId, input.appId)).limit(1);
  if (duplicate) return { ok: false, status: 409, error: "Este App ID já está cadastrado na plataforma." };
  const secret = await encryptToken(input.appSecret);
  const verify = await encryptToken(generateVerifyToken());
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.insert(metaApps).values({
      id, label: input.label, appId: input.appId, secretCiphertext: secret.ciphertext, secretIv: secret.iv,
      graphVersion: runtimeEnv().META_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION,
      redirectUri: input.origin + "/api/meta/callback", status: "active", createdByUserId: input.accountUserId,
      origin: "user", ownerWorkspaceUserId: input.workspaceOwnerUserId, ownerAccountUserId: input.accountUserId,
      webhookVerifyTokenCiphertext: verify.ciphertext, webhookVerifyTokenIv: verify.iv, createdAt: now, updatedAt: now,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("meta_app_id_already_exists")) return { ok: false, status: 409, error: "Este App ID já está cadastrado na plataforma." };
    throw error;
  }
  const members = [...new Set([input.accountUserId, input.workspaceOwnerUserId])];
  for (const accountUserId of members) {
    await db.insert(metaAppAssignments).values({ id: crypto.randomUUID(), metaAppId: id, accountUserId, workspaceOwnerUserId: input.workspaceOwnerUserId, status: "active", grantedAt: now, updatedAt: now })
      .onConflictDoNothing();
    await db.insert(metaAppUserPolicies).values({ accountUserId, workspaceOwnerUserId: input.workspaceOwnerUserId, managedAt: now })
      .onConflictDoNothing();
  }
  return { ok: true, id };
}

/** Enable/disable an app owned by this workspace. Existing connections keep their tokens. */
export async function setOwnMetaAppStatus(workspaceOwnerUserId: string, id: string, status: "active" | "disabled") {
  const rows = await getDb().update(metaApps).set({ status, updatedAt: new Date().toISOString() })
    .where(and(eq(metaApps.id, id), eq(metaApps.origin, "user"), eq(metaApps.ownerWorkspaceUserId, workspaceOwnerUserId)))
    .returning({ id: metaApps.id, label: metaApps.label });
  return rows[0] || null;
}

/** Secret + verify token for the public webhook endpoint. Only active user apps. */
export async function webhookCredentials(recordId: string) {
  const [row] = await getDb().select().from(metaApps).where(and(eq(metaApps.id, recordId), eq(metaApps.origin, "user"))).limit(1);
  if (!row || row.status !== "active") return null;
  const [appSecret, verifyToken] = await Promise.all([
    decryptOrNull(row.secretCiphertext, row.secretIv),
    decryptOrNull(row.webhookVerifyTokenCiphertext, row.webhookVerifyTokenIv),
  ]);
  if (!appSecret || !verifyToken) return null;
  return { appSecret, verifyToken, label: row.label };
}
