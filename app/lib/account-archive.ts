import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, metaConnections, publicationAttempts, scheduledPosts } from "../db/schema";
import { protectedCampaignPostEvidence, safelyCancellableCampaignPost } from "./campaign-publication-protection";

export const ACCOUNT_ARCHIVE_MESSAGE = "Conta arquivada; pendência cancelada com histórico preservado.";

/** A restored account can start new posts, but never resume a post retained by archival. */
export function operationalPostAccount() {
  return sql<boolean>`(exists(select 1 from accounts a where a.id=${scheduledPosts.accountId}
    and a.owner_user_id=${scheduledPosts.ownerUserId} and a.archived_at is null)
    and not exists(select 1 from publication_attempts pa where pa.scheduled_post_id=${scheduledPosts.id}
      and pa.owner_user_id=${scheduledPosts.ownerUserId} and pa.stage='account_archive'))`;
}

export async function archiveAccounts(ownerUserId: string, ids: string[]) {
  const db = getDb();
  const now = new Date().toISOString();
  const changed: Array<{ id: string; username: string }> = [];
  let cancelledPosts = 0;
  // Each account chunk is atomic and stays within D1's parameter limit.
  for (let offset = 0; offset < ids.length; offset += 40) {
    const chunk = ids.slice(offset, offset + 40);
    const scope = and(eq(scheduledPosts.ownerUserId, ownerUserId), inArray(scheduledPosts.accountId, chunk));
    const cancel = and(scope, inArray(scheduledPosts.status, ["pending", "retry", "container_created", "paused"]), safelyCancellableCampaignPost());
    const [archived, , , cancelled] = await db.batch([
      db.update(accounts).set({ archivedAt: now, connectionStatus: "Desconectada", queueCount: 0, updatedAt: now })
        .where(and(eq(accounts.ownerUserId, ownerUserId), inArray(accounts.id, chunk), isNull(accounts.archivedAt)))
        .returning({ id: accounts.id, username: accounts.username }),
      db.update(metaConnections).set({ status: "archived", lastError: "Conta arquivada pelo workspace.", updatedAt: now })
        .where(and(eq(metaConnections.ownerUserId, ownerUserId), sql`exists(select 1 from accounts a where a.owner_user_id=${metaConnections.ownerUserId} and a.instagram_account_id=${metaConnections.instagramUserId} and ${inArray(sql`a.id`, chunk)} and a.archived_at is not null)`)),
      // Durable retention evidence survives restore/reconnect and later message changes.
      db.insert(publicationAttempts).select(db.select({
        id: sql<string>`lower(hex(randomblob(16)))`.as("id"), ownerUserId: scheduledPosts.ownerUserId,
        scheduledPostId: scheduledPosts.id, stage: sql<string>`'account_archive'`.as("stage"), outcome: sql<string>`'retained'`.as("outcome"),
        metaErrorCode: sql<string>`null`.as("metaErrorCode"), message: sql<string>`${ACCOUNT_ARCHIVE_MESSAGE}`.as("message"), createdAt: sql<string>`${now}`.as("createdAt"),
      }).from(scheduledPosts).where(and(scope, sql`not exists(select 1 from publication_attempts pa where pa.scheduled_post_id=${scheduledPosts.id} and pa.owner_user_id=${scheduledPosts.ownerUserId} and pa.stage='account_archive')`))),
      db.update(scheduledPosts).set({ status: "cancelled", lastError: ACCOUNT_ARCHIVE_MESSAGE, updatedAt: now })
        .where(cancel).returning({ id: scheduledPosts.id }),
    ]);
    changed.push(...archived);
    cancelledPosts += cancelled.length;
  }
  let inFlightPosts = 0; let protectedPosts = 0;
  for (let offset = 0; offset < ids.length; offset += 40) {
    const [preserved] = await db.select({
      inFlightPosts: sql<number>`sum(case when ${scheduledPosts.status}='processing' or ${scheduledPosts.lockedAt} is not null or nullif(${scheduledPosts.lockToken}, '') is not null then 1 else 0 end)`,
      protectedPosts: sql<number>`sum(case when ${protectedCampaignPostEvidence()} then 1 else 0 end)`,
    }).from(scheduledPosts).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), inArray(scheduledPosts.accountId, ids.slice(offset, offset + 40))));
    inFlightPosts += Number(preserved?.inFlightPosts) || 0;
    protectedPosts += Number(preserved?.protectedPosts) || 0;
  }
  return { archived: changed.length, cancelledPosts, usernames: changed.map((row) => row.username),
    inFlightPosts, protectedPosts };
}
