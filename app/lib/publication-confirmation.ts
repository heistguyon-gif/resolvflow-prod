import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, campaigns, metaConnections, publicationAttempts, scheduledPosts } from "../db/schema";
import { connectionApiMode, getContainerStatus, isQueueAborted } from "./meta-api";
import { decryptToken } from "./token-crypto";
import { sanitizeMetaMessage } from "./meta-diagnostics";
import { protectedCampaignPostEvidence } from "./campaign-publication-protection";
import { PUBLICATION_ID_PENDING_MESSAGE, PUBLICATION_CONFIRMATION_PENDING_MESSAGE } from "./publication-recovery";

type Post = typeof scheduledPosts.$inferSelect;

/** Receipt and derived campaign/queue totals commit together. Safe to call twice. */
export async function savePublicationConfirmation(post: Post, mediaId: string | null, lockToken?: string, receiptAt?: string) {
  const db = getDb();
  const now = new Date().toISOString();
  const identity = and(eq(scheduledPosts.id, post.id), eq(scheduledPosts.ownerUserId, post.ownerUserId),
    eq(scheduledPosts.containerId, post.containerId || ""));
  const [changed] = await db.batch([
    db.update(scheduledPosts).set({ status: "published", publishedMediaId: mediaId,
      // A later PUBLISHED lookup proves existence, not the date of publication.
      publishedAt: sql`coalesce(${scheduledPosts.publishedAt}, ${mediaId ? (receiptAt || now) : null})`,
      lastError: mediaId ? null : PUBLICATION_ID_PENDING_MESSAGE,
      lockedAt: null, lockToken: null, updatedAt: now,
    }).where(and(identity, ...(lockToken ? [eq(scheduledPosts.lockToken, lockToken)] : []),
      inArray(scheduledPosts.status, ["processing", "paused", "cancelled"]),
    )).returning({ id: scheduledPosts.id }),
    // changes() belongs to the preceding transition in this atomic batch.
    // Preserve older totals whose detail rows were removed before retention was fixed.
    db.update(campaigns).set({ publishedCount: sql`max(${campaigns.publishedCount} + changes(), (select count(*) from scheduled_posts p where p.campaign_id=${campaigns.id} and p.owner_user_id=${campaigns.ownerUserId} and p.status='published'))`, updatedAt: now })
      .where(and(eq(campaigns.id, post.campaignId), eq(campaigns.ownerUserId, post.ownerUserId))),
    db.update(scheduledPosts).set({ publishedMediaId: mediaId, lastError: null, updatedAt: now })
      .where(and(identity, eq(scheduledPosts.status, "published"), isNull(scheduledPosts.publishedMediaId), sql`${mediaId} is not null`)),
    db.insert(publicationAttempts).select(db.select({
      id: sql<string>`${`publication-confirmed:${post.id}`}`.as("id"), ownerUserId: scheduledPosts.ownerUserId,
      scheduledPostId: scheduledPosts.id, stage: sql<string>`'publication_confirmation'`.as("stage"),
      outcome: sql<string>`'published'`.as("outcome"), metaErrorCode: sql<string>`null`.as("metaErrorCode"),
      message: sql<string>`${mediaId ? `ID da publicação confirmado: ${mediaId}` : `Contêiner ${post.containerId}: PUBLISHED. ${PUBLICATION_ID_PENDING_MESSAGE}`}`.as("message"),
      createdAt: sql<string>`${now}`.as("createdAt"),
    }).from(scheduledPosts).where(and(identity, eq(scheduledPosts.status, "published"))))
      .onConflictDoNothing(),
    db.update(accounts).set({ queueCount: sql`case when ${accounts.archivedAt} is not null then 0 else (select count(*) from scheduled_posts p join campaigns c on c.id=p.campaign_id and c.owner_user_id=p.owner_user_id where p.account_id=${accounts.id} and p.owner_user_id=${accounts.ownerUserId} and c.status not in ('archived','cancelled') and p.status in ('pending','retry','container_created','processing','paused')) end`, updatedAt: now })
      .where(and(eq(accounts.id, post.accountId), eq(accounts.ownerUserId, post.ownerUserId))),
  ]);
  return Boolean(changed.length);
}

/** Only GETs the exact saved container. Never guesses a media ID or republishes. */
export async function reconcilePublicationConfirmations(ownerUserId?: string) {
  const db = getDb();
  const now = new Date().toISOString();
  const rows = await db.select({ post: scheduledPosts, connection: metaConnections, version: campaigns.metaApiVersion })
    .from(scheduledPosts)
    .innerJoin(metaConnections, and(eq(metaConnections.id, scheduledPosts.connectionId), eq(metaConnections.ownerUserId, scheduledPosts.ownerUserId)))
    .innerJoin(campaigns, and(eq(campaigns.id, scheduledPosts.campaignId), eq(campaigns.ownerUserId, scheduledPosts.ownerUserId)))
    .where(and(inArray(scheduledPosts.status, ["paused", "cancelled"]), isNull(scheduledPosts.publishedAt), isNull(scheduledPosts.publishedMediaId), isNotNull(scheduledPosts.containerId),
      isNull(scheduledPosts.lockToken), isNull(scheduledPosts.lockedAt), lte(scheduledPosts.nextAttemptAt, now),
      eq(metaConnections.status, "connected"), protectedCampaignPostEvidence(),
      ...(ownerUserId ? [eq(scheduledPosts.ownerUserId, ownerUserId)] : []),
      sql`(select count(*) from publication_attempts pa where pa.scheduled_post_id=${scheduledPosts.id} and pa.owner_user_id=${scheduledPosts.ownerUserId} and pa.stage='publication_confirmation' and pa.outcome in ('waiting','unavailable')) < 5`,
    )).orderBy(
      sql`case when ${scheduledPosts.ownerUserId} = (select json_extract(details_json, '$.ownerUserId') from system_health where key='publication_recovery_priority' and json_valid(details_json) and json_extract(details_json, '$.until') > ${now}) then 0 else 1 end`,
      sql`(select count(*) from publication_attempts pa where pa.scheduled_post_id=${scheduledPosts.id} and pa.owner_user_id=${scheduledPosts.ownerUserId} and pa.stage='publication_confirmation')`,
      desc(scheduledPosts.scheduledFor), asc(scheduledPosts.id)).limit(32);
  let confirmed = 0;
  // One bounded parallel batch leaves time for the ordinary scheduler.
  await Promise.all(rows.map(async ({ post, connection, version }) => {
    if (isQueueAborted()) return;
    const lease = `confirmation:${crypto.randomUUID()}`;
    const [claimed] = await db.update(scheduledPosts).set({ lockToken: lease, lockedAt: now, nextAttemptAt: new Date(Date.now() + 60_000).toISOString() })
      .where(and(eq(scheduledPosts.id, post.id), eq(scheduledPosts.ownerUserId, post.ownerUserId), eq(scheduledPosts.status, post.status), isNull(scheduledPosts.lockToken), isNull(scheduledPosts.lockedAt))).returning({ id: scheduledPosts.id });
    if (!claimed) return;
    let outcome = "unavailable";
    let message = "A confirmação não pôde ser consultada neste ciclo.";
    try {
      const receipts = await db.select({ message: publicationAttempts.message, createdAt: publicationAttempts.createdAt }).from(publicationAttempts)
        .where(and(eq(publicationAttempts.scheduledPostId, post.id), eq(publicationAttempts.ownerUserId, post.ownerUserId),
          eq(publicationAttempts.stage, "publish_receipt"), eq(publicationAttempts.outcome, "confirmed"))).limit(2);
      if (receipts.length === 1) {
        let receipt: { containerId?: string; connectionId?: string; mediaId?: string } = {};
        try { receipt = JSON.parse(receipts[0].message || "{}"); } catch { /* Invalid evidence must not establish success. */ }
        if (receipt && receipt.containerId === post.containerId && receipt.connectionId === post.connectionId
          && typeof receipt.mediaId === "string" && /^\d+$/.test(receipt.mediaId)) {
          const receiptDate = new Date(receipts[0].createdAt.replace(" ", "T").replace(/(?<!Z)$/, "Z"));
          if (!Number.isFinite(receiptDate.getTime())) throw new Error("Recibo sem data válida; confirmação preservada para consulta.");
          if (await savePublicationConfirmation(post, receipt.mediaId, lease, receiptDate.toISOString())) confirmed++;
          return;
        }
      }
      const token = await decryptToken(connection.tokenCiphertext, connection.tokenIv);
      const status = await getContainerStatus(post.containerId!, token, connectionApiMode(connection.scopes), version, AbortSignal.timeout(6_000));
      if (status.status_code === "PUBLISHED") {
        if (await savePublicationConfirmation(post, post.publishedMediaId, lease)) confirmed++;
        return;
      }
      outcome = "waiting";
      message = `Contêiner ${post.containerId}: ${status.status_code}. Nenhum novo envio foi feito.`;
    } catch (error) {
      message = sanitizeMetaMessage(error instanceof Error ? error.message : message);
    } finally {
      // Also releases the lease when the confirmation write failed; no resend.
      await db.update(scheduledPosts).set({ lockToken: null, lockedAt: null, updatedAt: new Date().toISOString() })
        .where(and(eq(scheduledPosts.id, post.id), eq(scheduledPosts.ownerUserId, post.ownerUserId), eq(scheduledPosts.lockToken, lease)));
    }
    await db.insert(publicationAttempts).values({ id: crypto.randomUUID(), ownerUserId: post.ownerUserId, scheduledPostId: post.id,
      stage: "publication_confirmation", outcome, message: message.slice(0, 900) });
    await db.update(scheduledPosts).set({ lastError: PUBLICATION_CONFIRMATION_PENDING_MESSAGE })
      .where(and(eq(scheduledPosts.id, post.id), eq(scheduledPosts.ownerUserId, post.ownerUserId), eq(scheduledPosts.status, "paused"), isNull(scheduledPosts.lockToken)));
  }));
  return confirmed;
}
