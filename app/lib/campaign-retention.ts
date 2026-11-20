import { PROTECTED_PUBLICATION_MESSAGES } from "./publication-recovery";

const protectedMessagesSql = PROTECTED_PUBLICATION_MESSAGES.map((message) => `'${message.replaceAll("'", "''")}'`).join(", ");

/** Keep archived history and evidence left by older cancellation paths. */
export const CANCELLED_POSTS_CLEANUP_SQL = `
DELETE FROM scheduled_posts
WHERE id IN (
  SELECT post.id
  FROM scheduled_posts AS post
  WHERE post.status = 'cancelled'
    AND julianday(post.updated_at) < julianday(?)
    AND post.published_at IS NULL
    AND nullif(post.published_media_id, '') IS NULL
    AND nullif(post.published_permalink, '') IS NULL
    AND post.locked_at IS NULL
    AND nullif(post.lock_token, '') IS NULL
    AND coalesce(post.last_error, '') NOT IN (${protectedMessagesSql})
    AND NOT EXISTS (
      SELECT 1 FROM publication_attempts AS attempt
      WHERE attempt.scheduled_post_id = post.id
        AND attempt.owner_user_id = post.owner_user_id
        AND (attempt.outcome = 'published' OR attempt.stage IN ('publish', 'account_archive', 'queue_cancel')
          OR attempt.message IN (${protectedMessagesSql}))
    )
    AND NOT EXISTS (
      SELECT 1 FROM accounts AS account
      WHERE account.id = post.account_id AND account.owner_user_id = post.owner_user_id
        AND account.archived_at IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM campaigns AS campaign
      WHERE campaign.id = post.campaign_id
        AND campaign.owner_user_id = post.owner_user_id
        AND campaign.status = 'archived'
    )
  LIMIT 400
)
`;
