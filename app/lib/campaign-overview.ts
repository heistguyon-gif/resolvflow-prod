import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { campaigns, scheduledPosts } from "../db/schema";
import { campaignActivityTimestamp } from "./campaign-activity";
import { sanitizeMetaMessage } from "./meta-diagnostics";
import type { CampaignMetricCoverage, CampaignOverviewResponse, CampaignOverviewSummary } from "./campaign-management-types";

const ACTIVE = ["pending", "retry", "container_created", "processing"];
const STATUSES = [...ACTIVE, "published", "failed", "blocked", "paused", "cancelled"];

export async function campaignOverview(ownerUserId: string, page: number, pageSize: number): Promise<CampaignOverviewResponse> {
  const db = getDb();
  const fetchedAt = new Date().toISOString();
  // Running is derived from execution rows, never from potentially stale campaign counters.
  const running = and(eq(campaigns.ownerUserId, ownerUserId), eq(campaigns.status, "scheduled"), sql`(
    julianday(${campaigns.startAt}) <= julianday(${fetchedAt}) or exists (
      select 1 from scheduled_posts published_post where published_post.campaign_id=${campaigns.id}
        and published_post.owner_user_id=${ownerUserId} and published_post.status='published'))`)!;
  const postOwner = eq(scheduledPosts.ownerUserId, ownerUserId);
  // Conflicting receipt rows are unavailable for sums rather than counted twice.
  const duplicateReceipts = db.select({
    accountId: scheduledPosts.accountId, mediaId: scheduledPosts.publishedMediaId,
    count: sql<number>`count(*)`.as("receipt_count"),
  }).from(scheduledPosts).innerJoin(campaigns, and(eq(campaigns.id, scheduledPosts.campaignId), running))
    .where(and(postOwner, eq(scheduledPosts.status, "published"), isNotNull(scheduledPosts.publishedMediaId), sql`${scheduledPosts.publishedMediaId} != ''`))
    .groupBy(scheduledPosts.accountId, scheduledPosts.publishedMediaId).having(sql`count(*) > 1`).as("duplicate_receipts");
  const countWhen = (condition: ReturnType<typeof sql>) => sql<number>`coalesce(sum(case when ${condition} then 1 else 0 end),0)`;
  const isPublished = eq(scheduledPosts.status, "published");
  const metric = (column: typeof scheduledPosts.mediaViews | typeof scheduledPosts.mediaReach, prefix: string) => {
    const known = and(isPublished, sql`nullif(${scheduledPosts.publishedMediaId}, '') is not null`, sql`${duplicateReceipts.count} is null`,
      sql`(${column} > 0 or (${column} = 0 and ${scheduledPosts.insightsSyncedAt} is not null))`)!;
    return {
      [`${prefix}Known`]: countWhen(known),
      [`${prefix}Sum`]: sql<number | null>`sum(case when ${known} then ${column} else null end)`,
      [`${prefix}Stale`]: countWhen(and(known, sql`(${scheduledPosts.insightsError} is not null or ${scheduledPosts.insightsSyncedAt} is null)`)! ),
    };
  };
  const selection = {
    total: sql<number>`count(${scheduledPosts.id})`, distinctAccountCount: sql<number>`count(distinct ${scheduledPosts.accountId})`,
    ...Object.fromEntries(STATUSES.map((status) => [status, countWhen(eq(scheduledPosts.status, status))])),
    unknown: countWhen(and(isNotNull(scheduledPosts.id), sql`${scheduledPosts.status} not in (${sql.join(STATUSES.map((status) => sql`${status}`), sql`, `)})`)! ),
    waiting: countWhen(and(inArray(scheduledPosts.status, ACTIVE), sql`length(trim(coalesce(${scheduledPosts.lastError},''))) > 0`)! ),
    delayed: countWhen(and(inArray(scheduledPosts.status, ACTIVE), sql`julianday(${scheduledPosts.scheduledFor}) < julianday(${fetchedAt})`)! ),
    eligible: countWhen(isPublished), conflicts: countWhen(sql`${duplicateReceipts.count} is not null`),
    ...metric(scheduledPosts.mediaViews, "views"), ...metric(scheduledPosts.mediaReach, "reach"),
  };
  const joinReceipts = and(eq(duplicateReceipts.accountId, scheduledPosts.accountId), eq(duplicateReceipts.mediaId, scheduledPosts.publishedMediaId));
  const [totals, pageRows] = await Promise.all([
    db.select({ ...selection, campaignCount: sql<number>`count(distinct ${campaigns.id})` }).from(campaigns)
      .leftJoin(scheduledPosts, and(eq(scheduledPosts.campaignId, campaigns.id), postOwner)).leftJoin(duplicateReceipts, joinReceipts).where(running),
    db.select({ id: campaigns.id, name: campaigns.name, status: campaigns.status, timezone: campaigns.timezone, startAt: campaigns.startAt, createdAt: campaigns.createdAt })
      .from(campaigns).where(running).orderBy(desc(campaigns.createdAt), asc(campaigns.id)).limit(pageSize).offset((page - 1) * pageSize),
  ]);
  const grouped = pageRows.length ? await db.select({ id: scheduledPosts.campaignId, ...selection }).from(scheduledPosts)
    .innerJoin(campaigns, and(eq(campaigns.id, scheduledPosts.campaignId), running))
    .leftJoin(duplicateReceipts, joinReceipts)
    .where(and(postOwner, inArray(scheduledPosts.campaignId, pageRows.map((row) => row.id)))).groupBy(scheduledPosts.campaignId) : [];
  const summary = (row: Record<string, unknown> = {}): CampaignOverviewSummary => {
    const number = (key: string) => Number(row[key] ?? 0);
    const coverage = (prefix: string): CampaignMetricCoverage => {
      const eligiblePosts = number("eligible"); const knownPosts = number(`${prefix}Known`);
      return { knownSum: knownPosts ? Number(row[`${prefix}Sum`]) : null, knownPosts,
        unknownPosts: eligiblePosts - knownPosts, eligiblePosts, complete: eligiblePosts > 0 && knownPosts === eligiblePosts,
        staleOrPartialPosts: number(`${prefix}Stale`) };
    };
    return { total: number("total"), distinctAccountCount: number("distinctAccountCount"), published: number("published"), failed: number("failed"), blocked: number("blocked"), waiting: number("waiting"), delayed: number("delayed"),
      byStatus: Object.fromEntries([...STATUSES, "unknown"].map((status) => [status, number(status)])),
      metrics: { views: coverage("views"), reach: coverage("reach") },
      warnings: number("conflicts") ? ["Há registros com o mesmo identificador de publicação. Suas métricas foram excluídas das somas para evitar duplicidade."] : [] };
  };
  const byCampaign = new Map(grouped.map((row) => [row.id, summary(row)]));
  const total = Number(totals[0]?.campaignCount ?? 0);
  return { fetchedAt, consistency: "eventual", scope: "workspace", summary: { ...summary(totals[0]), campaignCount: total },
    campaigns: pageRows.map((row) => ({ ...row, name: sanitizeMetaMessage(row.name), startAt: campaignActivityTimestamp(row.startAt), createdAt: campaignActivityTimestamp(row.createdAt), summary: byCampaign.get(row.id) ?? summary() })),
    pagination: { page, pageSize, total, hasMore: (page - 1) * pageSize + pageRows.length < total } };
}
