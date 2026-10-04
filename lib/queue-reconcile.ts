import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, campaigns, scheduledPosts } from "../db/schema";

export const LIVE_QUEUE_STATUSES = ["pending", "retry", "container_created", "processing", "paused"] as const;

export async function liveQueueByAccount(ownerUserId?: string) {
  const filters = [inArray(scheduledPosts.status, [...LIVE_QUEUE_STATUSES])];
  if (ownerUserId) filters.push(eq(scheduledPosts.ownerUserId, ownerUserId));
  const rows = await getDb().select({
    accountId: scheduledPosts.accountId,
    total: sql<number>`count(*)`,
  }).from(scheduledPosts).where(and(...filters)).groupBy(scheduledPosts.accountId);
  return new Map(rows.map((row) => [String(row.accountId), Number(row.total) || 0]));
}

export async function liveCampaignIds(ownerUserId?: string) {
  const filters = [inArray(scheduledPosts.status, [...LIVE_QUEUE_STATUSES])];
  if (ownerUserId) filters.push(eq(scheduledPosts.ownerUserId, ownerUserId));
  const rows = await getDb().select({ campaignId: scheduledPosts.campaignId }).from(scheduledPosts).where(and(...filters)).groupBy(scheduledPosts.campaignId);
  return new Set(rows.map((row) => String(row.campaignId)));
}

export async function markCampaignIfFinished(campaignId: string) {
  const [live] = await getDb().select({ id: scheduledPosts.id }).from(scheduledPosts).where(and(
    eq(scheduledPosts.campaignId, campaignId),
    inArray(scheduledPosts.status, [...LIVE_QUEUE_STATUSES]),
  )).limit(1);
  if (live) return false;
  const updated = await getDb().update(campaigns).set({ status: "completed", updatedAt: new Date().toISOString() }).where(and(
    eq(campaigns.id, campaignId),
    inArray(campaigns.status, ["scheduled", "paused"]),
  )).returning({ id: campaigns.id });
  return Boolean(updated[0]);
}

export async function reconcileFinishedCampaigns(ownerUserId?: string) {
  const live = await liveCampaignIds(ownerUserId);
  const filters = [inArray(campaigns.status, ["scheduled", "paused"])];
  if (ownerUserId) filters.push(eq(campaigns.ownerUserId, ownerUserId));
  const scheduled = await getDb().select({ id: campaigns.id }).from(campaigns).where(and(...filters));
  const finished = scheduled.map((campaign) => campaign.id).filter((id) => !live.has(String(id)));
  if (!finished.length) return 0;
  const now = new Date().toISOString();
  for (let index = 0; index < finished.length; index += 20) {
    await getDb().update(campaigns).set({ status: "completed", updatedAt: now }).where(and(inArray(campaigns.id, finished.slice(index, index + 20)), inArray(campaigns.status, ["scheduled", "paused"])));
  }
  return finished.length;
}

export async function reconcileAccountQueueCounts(ownerUserId?: string) {
  const live = await liveQueueByAccount(ownerUserId);
  const query = getDb().select({ id: accounts.id, queueCount: accounts.queueCount }).from(accounts);
  const rows = ownerUserId ? await query.where(eq(accounts.ownerUserId, ownerUserId)) : await query;
  const now = new Date().toISOString();
  let fixed = 0;
  const pending = rows.filter((row) => (live.get(String(row.id)) || 0) !== Number(row.queueCount || 0));
  for (let index = 0; index < pending.length; index += 10) {
    await Promise.all(pending.slice(index, index + 10).map((row) => getDb().update(accounts).set({ queueCount: live.get(String(row.id)) || 0, updatedAt: now }).where(eq(accounts.id, row.id))));
    fixed += Math.min(10, pending.length - index);
  }
  return fixed;
}

export async function reconcileQueueAndCampaigns(ownerUserId?: string) {
  const [campaignsCompleted, queuesFixed] = await Promise.all([
    reconcileFinishedCampaigns(ownerUserId),
    reconcileAccountQueueCounts(ownerUserId),
  ]);
  return { campaignsCompleted, queuesFixed };
}
