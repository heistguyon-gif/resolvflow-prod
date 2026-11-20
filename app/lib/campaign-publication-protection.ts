import { inArray, sql } from "drizzle-orm";
import { scheduledPosts } from "../db/schema";
import { PROTECTED_PUBLICATION_MESSAGES } from "./publication-recovery";

/** Evaluated inside the mutation, so a receipt/event committed after a read wins. */
export function protectedCampaignPostEvidence() {
  return sql<boolean>`(${scheduledPosts.publishedAt} is not null
    or nullif(${scheduledPosts.publishedMediaId}, '') is not null
    or nullif(${scheduledPosts.publishedPermalink}, '') is not null
    or ${scheduledPosts.status} = 'published'
    or coalesce(${scheduledPosts.lastError}, '') in (${sql.join(PROTECTED_PUBLICATION_MESSAGES.map((message) => sql`${message}`), sql`, `)})
    or exists (select 1 from publication_attempts pa where pa.scheduled_post_id = ${scheduledPosts.id}
      and pa.owner_user_id = ${scheduledPosts.ownerUserId}
      and (pa.outcome = 'published' or pa.stage = 'publish' or pa.message in (${sql.join(PROTECTED_PUBLICATION_MESSAGES.map((message) => sql`${message}`), sql`, `)}))))`;
}

export function safelyCancellableCampaignPost() {
  return sql<boolean>`(${inArray(scheduledPosts.status, ["pending", "retry", "container_created", "paused", "failed", "blocked"])}
    and ${scheduledPosts.lockedAt} is null and nullif(${scheduledPosts.lockToken}, '') is null
    and not ${protectedCampaignPostEvidence()})`;
}
