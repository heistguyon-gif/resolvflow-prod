import { and, asc, desc, eq, gte, isNotNull, isNull, like, lt, ne, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, metaConnections, scheduledPosts } from "../db/schema";
import { connectionApiMode, getAccountInsights, getInstagramProfile, getMediaInsights, getPublishingLimit } from "./meta-api";
import { decryptToken } from "./token-crypto";
import { deriveConnectedHealth, isMetaRestrictionError } from "./account-health";

type SyncOptions = {
  ownerUserId?: string;
  automatic?: boolean;
  profileOnly?: boolean;
  maxMediaPerConnection?: number;
  maxConnections?: number;
  runStartedAt?: string;
  skipAccountInsights?: boolean;
  signal?: AbortSignal;
};

export function isWorkerBudgetError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /too many subrequests|subrequest limit|worker exceeded cpu|CPU time limit/i.test(message);
}

export function isRetryableConnectionError(error: string | null | undefined) {
  return /unexpected error|temporar|retry|try again|timeout|timed out|failed query|too many subrequests|subrequest limit|rate limit/i.test(error || "");
}

async function inBatches<T>(items: T[], concurrency: number, worker: (item: T) => Promise<boolean>) {
  let updated = 0; let failed = 0;
  for (let index = 0; index < items.length; index += concurrency) {
    const results = await Promise.all(items.slice(index, index + concurrency).map((item) => worker(item).catch(() => false)));
    updated += results.filter(Boolean).length; failed += results.filter((value) => !value).length;
  }
  return { updated, failed };
}

function currentSyncConnection(connection: typeof metaConnections.$inferSelect) {
  // OAuth encrypts with a fresh IV, so reconnection invalidates an old sync even
  // when updated_at has the same millisecond. Never expose this snapshot to clients.
  return sql<boolean>`exists(select 1 from meta_connections c join accounts a
    on a.owner_user_id=c.owner_user_id and a.instagram_account_id=c.instagram_user_id
    where c.id=${connection.id} and c.owner_user_id=${connection.ownerUserId}
      and c.instagram_user_id=${connection.instagramUserId} and a.archived_at is null
      and c.status=${connection.status} and c.status!='archived'
      and c.token_iv=${connection.tokenIv} and c.last_sync_at is ${connection.lastSyncAt})`;
}

export async function syncMetaAccounts(options: SyncOptions = {}) {
  const db = getDb(); const now = new Date(); const nowIso = now.toISOString();
  const signal = options.signal || AbortSignal.timeout(25_000);
  const activeAccount = sql`exists(select 1 from accounts a where a.owner_user_id=${metaConnections.ownerUserId} and a.instagram_account_id=${metaConnections.instagramUserId} and a.archived_at is null)`;
  await db.update(metaConnections).set({ status: "connected", lastError: null, updatedAt: nowIso }).where(and(
    eq(metaConnections.status, "error"), activeAccount,
    like(metaConnections.lastError, "%Too many subrequests%"),
    ...(options.ownerUserId ? [eq(metaConnections.ownerUserId, options.ownerUserId)] : []),
  ));
  const connectionRows = options.ownerUserId
    ? await db.select().from(metaConnections).where(and(eq(metaConnections.ownerUserId, options.ownerUserId), ne(metaConnections.status, "archived"), activeAccount))
    : await db.select().from(metaConnections).where(and(ne(metaConnections.status, "archived"), activeAccount));
  const connectionFreshCutoff = now.getTime() - 25 * 60_000;
  const connectionRetryCutoff = now.getTime() - 25 * 60_000;
  const runStartedAt = options.runStartedAt ? Date.parse(options.runStartedAt) : Number.NaN;
  const publishedCutoff = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const recentPublishCutoff = new Date(now.getTime() - 3 * 86_400_000).toISOString();
  // Failed media must not occupy every slot on every poll indefinitely.
  const mediaRetryCutoff = new Date(now.getTime() - 8 * 60_000).toISOString();
  const mediaRetryReady = or(isNull(scheduledPosts.insightsError), lt(scheduledPosts.updatedAt, mediaRetryCutoff));
  const profileOnly = options.profileOnly === true || (options.maxMediaPerConnection === 0);
  const unsyncedUserIds = new Set<string>();
  if (!profileOnly) {
    const unsyncedOwners = options.ownerUserId ? [eq(scheduledPosts.ownerUserId, options.ownerUserId)] : [];
    const unsyncedRows = await db.selectDistinct({ instagramAccountId: accounts.instagramAccountId }).from(scheduledPosts).innerJoin(accounts, eq(scheduledPosts.accountId, accounts.id)).where(and(
      eq(scheduledPosts.status, "published"),
      isNotNull(scheduledPosts.publishedMediaId),
      gte(scheduledPosts.publishedAt, publishedCutoff),
      mediaRetryReady,
      or(
        isNull(scheduledPosts.insightsSyncedAt),
        and(eq(scheduledPosts.mediaViews, 0), lt(scheduledPosts.insightsSyncedAt, new Date(now.getTime() - 8 * 60_000).toISOString()), gte(scheduledPosts.publishedAt, recentPublishCutoff)),
      ),
      ...unsyncedOwners,
    ));
    for (const row of unsyncedRows) if (row.instagramAccountId) unsyncedUserIds.add(row.instagramAccountId);
  }
  let eligibleConnections = options.automatic
    ? connectionRows.filter((connection) => {
      if (connection.status === "error") return isRetryableConnectionError(connection.lastError) && new Date(connection.updatedAt || 0).getTime() < connectionRetryCutoff;
      return !connection.lastSyncAt || new Date(connection.lastSyncAt).getTime() < connectionFreshCutoff || unsyncedUserIds.has(connection.instagramUserId);
    })
    : connectionRows.filter((connection) => connection.status !== "error" || isRetryableConnectionError(connection.lastError));
  if (Number.isFinite(runStartedAt)) {
    eligibleConnections = eligibleConnections.filter((connection) => !connection.lastSyncAt || new Date(connection.lastSyncAt).getTime() < runStartedAt);
  }
  eligibleConnections.sort((left, right) => {
    const leftNeed = unsyncedUserIds.has(left.instagramUserId) ? 0 : 1;
    const rightNeed = unsyncedUserIds.has(right.instagramUserId) ? 0 : 1;
    if (leftNeed !== rightNeed) return leftNeed - rightNeed;
    return new Date(left.lastSyncAt || 0).getTime() - new Date(right.lastSyncAt || 0).getTime();
  });
  const maxConnections = Math.min(Math.max(options.maxConnections ?? (options.automatic ? 2 : 6), 1), 12);
  const batch = eligibleConnections.slice(0, maxConnections);
  const mediaFreshCutoff = new Date(now.getTime() - 12 * 60_000).toISOString();
  const zeroViewFreshCutoff = new Date(now.getTime() - 8 * 60_000).toISOString();
  const mediaLimit = profileOnly ? 0 : Math.min(Math.max(options.maxMediaPerConnection ?? (options.automatic ? 8 : 16), 0), 40);
  let synced = 0; let mediaChecked = 0; let mediaUpdated = 0; let partialFailures = 0; let viewsCollected = 0; let budgetExhausted = false;

  const syncOne = async (connection: typeof batch[number]) => {
    if (signal.aborted) { budgetExhausted = true; return null; }
    const accessToken = await decryptToken(connection.tokenCiphertext, connection.tokenIv);
    const apiMode = connectionApiMode(connection.scopes);
    const accountRows = await db.select().from(accounts).where(and(eq(accounts.ownerUserId, connection.ownerUserId), eq(accounts.instagramAccountId, connection.instagramUserId), currentSyncConnection(connection))).limit(1);
    const account = accountRows[0];
    if (account?.archivedAt) return null;
    if (!account) return null;
    const [profile, limit, accountInsightsResult] = await Promise.all([
      getInstagramProfile(connection.instagramUserId, accessToken, apiMode, { operationId: connection.ownerUserId, metaAppKey: connection.metaAppKey || "default", stage: "sync.profile", signal }),
      getPublishingLimit(connection.instagramUserId, accessToken, apiMode, signal),
      options.skipAccountInsights
        ? Promise.resolve({ value: null, error: null as string | null })
        : getAccountInsights(connection.instagramUserId, accessToken, apiMode, signal).then((value) => ({ value, error: null as string | null })).catch((error) => ({ value: null, error: error instanceof Error ? error.message : "Métricas da conta indisponíveis" })),
    ]);
    const mediaWhere = options.automatic
      ? and(
        eq(scheduledPosts.ownerUserId, connection.ownerUserId),
        eq(scheduledPosts.accountId, account.id),
        eq(scheduledPosts.status, "published"),
        isNotNull(scheduledPosts.publishedMediaId),
        gte(scheduledPosts.publishedAt, publishedCutoff),
        or(
          isNull(scheduledPosts.insightsSyncedAt),
          lt(scheduledPosts.insightsSyncedAt, mediaFreshCutoff),
          and(eq(scheduledPosts.mediaViews, 0), lt(scheduledPosts.insightsSyncedAt, zeroViewFreshCutoff), gte(scheduledPosts.publishedAt, recentPublishCutoff)),
        ),
        mediaRetryReady,
      )
      : and(eq(scheduledPosts.ownerUserId, connection.ownerUserId), eq(scheduledPosts.accountId, account.id), eq(scheduledPosts.status, "published"), isNotNull(scheduledPosts.publishedMediaId), gte(scheduledPosts.publishedAt, publishedCutoff), mediaRetryReady);
    const [stillActive] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, account.id), eq(accounts.ownerUserId, connection.ownerUserId), isNull(accounts.archivedAt), currentSyncConnection(connection))).limit(1);
    if (!stillActive) return null;
    const mediaRows = mediaLimit
      ? await db.select({ id: scheduledPosts.id, publishedMediaId: scheduledPosts.publishedMediaId }).from(scheduledPosts).where(mediaWhere).orderBy(sql`case when ${scheduledPosts.insightsSyncedAt} is null then 0 when ${scheduledPosts.mediaViews} = 0 then 1 else 2 end`, asc(scheduledPosts.insightsSyncedAt), desc(scheduledPosts.publishedAt)).limit(mediaLimit)
      : [];
    const mediaResult = mediaRows.length ? await inBatches(mediaRows, 4, async (post) => {
      try {
        if (signal.aborted || budgetExhausted) { budgetExhausted = true; return false; }
        const [active] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, account.id), eq(accounts.ownerUserId, connection.ownerUserId), isNull(accounts.archivedAt), currentSyncConnection(connection))).limit(1);
        if (!active) return false;
        const insight = await getMediaInsights(post.publishedMediaId as string, accessToken, apiMode, signal);
        const complete = insight.viewsAvailable !== false && insight.reachAvailable !== false;
        const [saved] = await db.update(scheduledPosts).set({
          ...(insight.viewsAvailable !== false ? { mediaViews: insight.views } : {}),
          ...(insight.reachAvailable !== false ? { mediaReach: insight.reach } : {}),
          ...(complete ? { insightsSyncedAt: nowIso } : {}),
          insightsError: complete ? null : "A Meta retornou métricas parciais. Os valores anteriores foram preservados; nova consulta será feita.",
          updatedAt: nowIso,
        }).where(and(eq(scheduledPosts.id, post.id), eq(scheduledPosts.ownerUserId, connection.ownerUserId), currentSyncConnection(connection))).returning({ id: scheduledPosts.id });
        return Boolean(saved) && complete;
      } catch (error) {
        if (signal.aborted) { budgetExhausted = true; return false; }
        if (isWorkerBudgetError(error)) { budgetExhausted = true; return false; }
        await db.update(scheduledPosts).set({ insightsError: error instanceof Error ? error.message : "Insights indisponíveis", updatedAt: nowIso }).where(and(eq(scheduledPosts.id, post.id), eq(scheduledPosts.ownerUserId, connection.ownerUserId), currentSyncConnection(connection)));
        return false;
      }
    }) : { updated: 0, failed: 0 };
    const views30d = accountInsightsResult.value?.viewsAvailable ? accountInsightsResult.value.views30d : account.views30d;
    const reach30d = accountInsightsResult.value?.reachAvailable ? accountInsightsResult.value.reach30d : account.reach30d;
    const usage = limit.data?.[0]?.quota_usage ?? 0; const total = limit.data?.[0]?.config?.quota_total ?? 100;
    const restriction = isMetaRestrictionError(account.lastError) || isMetaRestrictionError(accountInsightsResult.error);
    const health = deriveConnectedHealth({ quotaUsed: usage, quotaTotal: total, restriction, lastError: restriction ? (accountInsightsResult.error || account.lastError) : null });
    // Account first: both writes check the same connection version in one D1 batch.
    // Updating the connection first would invalidate our own snapshot check.
    const [savedAccount] = await db.batch([
      db.update(accounts).set({
        username: profile.username.toLowerCase(),
        connectionStatus: "Conectada",
        healthStatus: health.healthStatus,
        source: "meta_oauth",
        ...(typeof profile.followers_count === "number" ? { followersCount: profile.followers_count } : {}),
        ...(typeof profile.follows_count === "number" ? { followsCount: profile.follows_count } : {}),
        ...(typeof profile.media_count === "number" ? { mediaCount: profile.media_count } : {}),
        ...(accountInsightsResult.value?.viewsAvailable ? { views30d } : {}),
        ...(accountInsightsResult.value?.reachAvailable ? { reach30d } : {}),
        ...(accountInsightsResult.value?.profileViewsAvailable ? { profileViews30d: accountInsightsResult.value.profileViews30d } : {}),
        ...(accountInsightsResult.value?.newFollowersAvailable ? { newFollowers30d: accountInsightsResult.value.newFollowers30d } : {}),
        lastError: health.lastError,
        updatedAt: nowIso,
      }).where(and(eq(accounts.ownerUserId, connection.ownerUserId), eq(accounts.id, account.id), isNull(accounts.archivedAt), currentSyncConnection(connection))).returning({ id: accounts.id }),
      db.update(metaConnections).set({ username: profile.username, accountType: profile.account_type || null, publishingLimitUsed: usage, publishingLimitTotal: total, status: "connected", lastError: restriction ? accountInsightsResult.error : null, lastSyncAt: nowIso, updatedAt: nowIso }).where(and(eq(metaConnections.id, connection.id), currentSyncConnection(connection))),
    ]);
    if (!savedAccount.length) return null;
    return { mediaChecked: mediaRows.length, mediaUpdated: mediaResult.updated, partialFailures: mediaResult.failed, views30d };
  };

  for (let index = 0; index < batch.length && !budgetExhausted; index += 4) {
    const slice = batch.slice(index, index + 4);
    const results = await Promise.all(slice.map(async (connection) => {
      try {
        return await syncOne(connection);
      } catch (error) {
        if (signal.aborted) { budgetExhausted = true; return null; }
        if (isWorkerBudgetError(error)) {
          budgetExhausted = true;
          return null;
        }
        const message = error instanceof Error ? error.message : "Falha de sincronização";
        const restriction = isMetaRestrictionError(error);
        const [failedAccount] = await db.batch([
          db.update(accounts).set({ healthStatus: restriction ? "Restrita" : "Desconhecida", lastError: message.slice(0, 900), updatedAt: nowIso }).where(and(eq(accounts.ownerUserId, connection.ownerUserId), eq(accounts.instagramAccountId, connection.instagramUserId), isNull(accounts.archivedAt), currentSyncConnection(connection))).returning({ id: accounts.id }),
          db.update(metaConnections).set({ status: "error", lastError: message, updatedAt: nowIso }).where(and(eq(metaConnections.id, connection.id), currentSyncConnection(connection))),
        ]);
        if (failedAccount.length) partialFailures += 1;
        return null;
      }
    }));
    for (const item of results) {
      if (!item) continue;
      synced += 1;
      mediaChecked += item.mediaChecked;
      mediaUpdated += item.mediaUpdated;
      partialFailures += item.partialFailures;
      viewsCollected += item.views30d;
    }
  }
  const remaining = Math.max(0, eligibleConnections.length - synced);
  return { synced, total: connectionRows.length, eligible: eligibleConnections.length, remaining, skippedFresh: connectionRows.length - eligibleConnections.length, mediaChecked, mediaUpdated, partialFailures, viewsCollected, automatic: Boolean(options.automatic), budgetExhausted };
}
