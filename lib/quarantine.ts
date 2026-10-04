import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, campaigns, integrations, metaConnections, scheduledPosts } from "../db/schema";
import { runtimeEnv } from "./runtime-env";

export const NEXOFLOW_QUARANTINE = runtimeEnv().NEXOFLOW_PUBLISHING_ENABLED !== "true";
export const NEXOFLOW_META_CONNECTIONS_ENABLED = runtimeEnv().NEXOFLOW_META_CONNECTIONS_ENABLED !== "false";
export const QUARANTINE_MESSAGE = "Publicação desativada por segurança. A organização, os relatórios e a equipe continuam disponíveis.";

const ACTIVE_POST_STATUSES = ["pending", "retry", "container_created", "processing", "paused", "blocked", "failed"];
const ACTIVE_CAMPAIGN_STATUSES = ["draft", "scheduled", "paused"];

export function quarantineResponse() {
  return Response.json({ error: QUARANTINE_MESSAGE, code: "nexoflow_quarantine", quarantine: true }, { status: 423 });
}

export async function enforceQuarantine(ownerUserId?: string) {
  const db = getDb();
  const now = new Date().toISOString();
  const postFilter = ownerUserId ? and(eq(scheduledPosts.ownerUserId, ownerUserId), inArray(scheduledPosts.status, ACTIVE_POST_STATUSES)) : inArray(scheduledPosts.status, ACTIVE_POST_STATUSES);
  const campaignFilter = ownerUserId ? and(eq(campaigns.ownerUserId, ownerUserId), inArray(campaigns.status, ACTIVE_CAMPAIGN_STATUSES)) : inArray(campaigns.status, ACTIVE_CAMPAIGN_STATUSES);
  const connectionFilter = ownerUserId ? eq(metaConnections.ownerUserId, ownerUserId) : undefined;
  const connections = connectionFilter
    ? await db.select({ instagramUserId: metaConnections.instagramUserId, username: metaConnections.username }).from(metaConnections).where(connectionFilter)
    : await db.select({ instagramUserId: metaConnections.instagramUserId, username: metaConnections.username }).from(metaConnections);

  const cancelledPosts = await db.update(scheduledPosts).set({ status: "cancelled", containerId: null, containerCaptionHash: null, lockedAt: null, lockToken: null, lastError: QUARANTINE_MESSAGE, updatedAt: now }).where(postFilter).returning({ id: scheduledPosts.id });
  const archivedCampaigns = await db.update(campaigns).set({ status: "cancelled", updatedAt: now }).where(campaignFilter).returning({ id: campaigns.id });
  const revokedConnections = await db.update(metaConnections).set({ status: "quarantined", tokenCiphertext: "", tokenIv: "", tokenExpiresAt: null, lastError: QUARANTINE_MESSAGE, updatedAt: now }).where(connectionFilter).returning({ id: metaConnections.id });

  if (connections.length) {
    const instagramIds = [...new Set(connections.map((connection) => connection.instagramUserId).filter(Boolean))];
    const usernames = [...new Set(connections.map((connection) => connection.username).filter(Boolean))];
    const connectedFilter = or(
      instagramIds.length ? inArray(accounts.instagramAccountId, instagramIds) : undefined,
      usernames.length ? inArray(accounts.username, usernames) : undefined,
    );
    if (connectedFilter) {
      await db.update(accounts).set({ healthStatus: "Suspensa", connectionStatus: "Em apelação", queueCount: 0, lastError: QUARANTINE_MESSAGE, updatedAt: now }).where(ownerUserId ? and(eq(accounts.ownerUserId, ownerUserId), connectedFilter) : connectedFilter);
    }
  }

  const integrationFilter = ownerUserId ? and(eq(integrations.ownerUserId, ownerUserId), eq(integrations.provider, "meta")) : eq(integrations.provider, "meta");
  await db.update(integrations).set({ status: "quarantined", accountCount: 0, updatedAt: now }).where(integrationFilter);

  return { quarantine: true, cancelledPosts: cancelledPosts.length, archivedCampaigns: archivedCampaigns.length, revokedConnections: revokedConnections.length };
}
