import { and, asc, eq, inArray, isNotNull, isNull, like, lte, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, campaignMedia, campaigns, metaConnections, publicationAttempts, scheduledPosts } from "../db/schema";
import { connectionApiMode, createMediaContainer, getContainerStatus, getPublishedMedia, getPublishingLimit, isQueueAborted, MetaApiError, publishContainer, type MetaApiMode } from "./meta-api";
import { deriveConnectedHealth, isMetaQuotaError, isMetaRestrictionError } from "./account-health";
import { paceLimit, readPublishPace } from "./publish-pace";
import { decryptToken } from "./token-crypto";
import { captionContainerSignature, captionsMatch, composeCampaignCaption, normalizeCaption } from "./captions";
import { parseCaptionVariations } from "./caption-variations";
import { isWorkerBudgetError } from "./meta-sync";
import { markCampaignIfFinished, reconcileFinishedCampaigns, reconcileQueueAndCampaigns } from "./queue-reconcile";

function rotationIndex(key: string, modulo: number) {
  if (modulo <= 1) return 0;
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  return hash % modulo;
}

const CAPTION_VERIFICATION_ATTEMPTS = 3;
const CAPTION_VERIFICATION_DELAY_MS = 500;
const CONTAINER_SETTLE_MS = 12_000;
const INACTIVE_CAMPAIGN_MESSAGE = "A publicação foi interrompida porque a campanha não está ativa.";

async function logAttempt(postId: string, ownerUserId: string, stage: string, outcome: string, message?: string, code?: number) {
  await getDb().insert(publicationAttempts).values({ id: crypto.randomUUID(), ownerUserId, scheduledPostId: postId, stage, outcome, message: message?.slice(0, 900) || null, metaErrorCode: code ? String(code) : null });
}

function isRateLimitedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === "object" && "code" in error ? Number((error as { code?: number }).code) : Number.NaN;
  return code === 4 || code === 17 || code === 32 || /too many actions|user request limit|application request limit|page request limit|rate limit|try again later/i.test(message);
}

function isInvalidMediaError(error: unknown) {
  return /Stories de imagem aceitam apenas JPG/i.test(error instanceof Error ? error.message : String(error));
}

async function cooldownAccountQueue(accountId: string, minutes: number) {
  const until = new Date(Date.now() + minutes * 60_000).toISOString();
  const now = new Date().toISOString();
  await getDb().update(scheduledPosts).set({ nextAttemptAt: until, updatedAt: now }).where(and(
    eq(scheduledPosts.accountId, accountId),
    inArray(scheduledPosts.status, ["pending", "retry", "container_created"]),
    lte(scheduledPosts.nextAttemptAt, until),
  ));
}

async function retryOrFail(post: typeof scheduledPosts.$inferSelect, error: unknown, stage: string, lockToken?: string) {
  const message = error instanceof Error ? error.message : "Falha inesperada na publicação.";
  const code = error instanceof MetaApiError ? error.code : undefined;
  const rateLimited = isRateLimitedError(error);
  const timedOut = /não respondeu a tempo/i.test(message);
  const unsupported = /unsupported request - method type/i.test(message);
  const exhausted = !rateLimited && (isInvalidMediaError(error) || isMetaRestrictionError(error) || post.attemptCount + 1 >= post.maxAttempts);
  const delayMinutes = rateLimited
    ? 15
    : timedOut || unsupported
      ? 1
      : Math.min(60, Math.max(2, 2 ** (post.attemptCount + 1)));
  const keepContainer = Boolean(post.containerId) && !exhausted;
  const [updated] = await getDb().update(scheduledPosts).set({
    status: exhausted ? "failed" : keepContainer ? "container_created" : "retry",
    attemptCount: rateLimited ? post.attemptCount : post.attemptCount + 1,
    nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
    lastError: message.slice(0, 900),
    lockedAt: null,
    lockToken: null,
    updatedAt: new Date().toISOString(),
  }).where(and(eq(scheduledPosts.id, post.id), ...(lockToken ? [eq(scheduledPosts.lockToken, lockToken)] : []))).returning({ id: scheduledPosts.id });
  if (!updated) return false;
  await logAttempt(post.id, post.ownerUserId, stage, exhausted ? "failed" : "retry", message, code);
  if (rateLimited) await cooldownAccountQueue(post.accountId, delayMinutes);
  if (exhausted) {
    await getDb().update(campaigns).set({ failedCount: sql`${campaigns.failedCount} + 1`, updatedAt: new Date().toISOString() }).where(eq(campaigns.id, post.campaignId));
    const health = isMetaRestrictionError(error) ? "Restrita" : isMetaQuotaError(error) ? "Limite atingido" : null;
    await getDb().update(accounts).set({ queueCount: sql`max(${accounts.queueCount} - 1, 0)`, ...(health ? { healthStatus: health, lastError: message.slice(0, 900) } : {}), updatedAt: new Date().toISOString() }).where(eq(accounts.id, post.accountId));
  }
  return true;
}

async function repairFutureCaptions(ownerUserId?: string) {
  const activeStatuses = ["pending", "retry", "paused", "blocked", "container_created"];
  const emptyCaption = or(isNull(scheduledPosts.captionOverride), eq(scheduledPosts.captionOverride, ""));
  const filters = [inArray(scheduledPosts.status, activeStatuses), emptyCaption];
  if (ownerUserId) filters.push(eq(scheduledPosts.ownerUserId, ownerUserId));
  const posts = await getDb().select().from(scheduledPosts).where(and(...filters)).orderBy(asc(scheduledPosts.campaignId), asc(scheduledPosts.scheduledFor)).limit(80);
  const campaignIds = [...new Set(posts.map((post) => post.campaignId))];
  if (!campaignIds.length) return 0;
  const campaignRows = await getDb().select().from(campaigns).where(inArray(campaigns.id, campaignIds));
  const accountIds = [...new Set(posts.map((post) => post.accountId))];
  const accountRows = accountIds.length ? await getDb().select({ id: accounts.id, username: accounts.username }).from(accounts).where(inArray(accounts.id, accountIds)) : [];
  const usernameByAccount = new Map(accountRows.map((account) => [account.id, account.username]));
  const campaignById = new Map(campaignRows.map((campaign) => [campaign.id, campaign]));
  const mediaRows = await getDb().select({ id: campaignMedia.id, campaignId: campaignMedia.campaignId, caption: campaignMedia.caption }).from(campaignMedia).where(inArray(campaignMedia.campaignId, campaignIds));
  const mediaCaptionById = new Map(mediaRows.map((item) => [item.id, item.caption]));
  const sequenceByCampaign = new Map<string, number>(); let repaired = 0;
  const pendingUpdates: Array<Promise<unknown>> = [];
  for (const post of posts) {
    const campaign = campaignById.get(post.campaignId); if (!campaign || campaign.mediaType === "STORIES") continue;
    const sequence = sequenceByCampaign.get(campaign.id) ?? 0; sequenceByCampaign.set(campaign.id, sequence + 1);
    const expected = composeCampaignCaption(campaign.caption, campaign.hashtags, sequence, { username: usernameByAccount.get(post.accountId), variations: parseCaptionVariations(campaign.captionVariations), mediaCaption: post.mediaItemId ? mediaCaptionById.get(post.mediaItemId) : "" });
    if (!expected || normalizeCaption(post.captionOverride || "") === normalizeCaption(expected)) continue;
    const resetContainer = post.status === "container_created";
    pendingUpdates.push(getDb().update(scheduledPosts).set({ captionOverride: expected, ...(resetContainer ? { status: campaign.status === "paused" ? "paused" : "pending", containerId: null, containerCaptionHash: null, nextAttemptAt: post.scheduledFor } : {}), lastError: null, lockedAt: null, lockToken: null, updatedAt: new Date().toISOString() }).where(eq(scheduledPosts.id, post.id)));
    repaired += 1;
  }
  for (let index = 0; index < pendingUpdates.length; index += 20) {
    await Promise.all(pendingUpdates.slice(index, index + 20));
  }
  return repaired;
}

async function campaignStillAllowsPublishing(post: typeof scheduledPosts.$inferSelect) {
  const [campaign] = await getDb().select({ status: campaigns.status }).from(campaigns).where(and(eq(campaigns.id, post.campaignId), eq(campaigns.ownerUserId, post.ownerUserId))).limit(1);
  return campaign?.status === "scheduled";
}

async function verifyPublishedCaption(mediaId: string, accessToken: string, expectedCaption: string, apiMode: MetaApiMode, graphVersionOverride?: string | null, attempts = CAPTION_VERIFICATION_ATTEMPTS) {
  let returnedCaption = "";
  let permalink: string | null = null;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const verified = await getPublishedMedia(mediaId, accessToken, apiMode, graphVersionOverride);
      permalink = verified.permalink || permalink;
      returnedCaption = normalizeCaption(verified.caption || "");
      if (captionsMatch(expectedCaption, returnedCaption)) return { confirmed: true, returnedCaption, permalink };
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, CAPTION_VERIFICATION_DELAY_MS));
  }
  if (lastError && !returnedCaption) throw lastError;
  return { confirmed: false, returnedCaption, permalink };
}

function dateKey(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${value.year}-${value.month}-${value.day}`;
}

export function takeFairDuePosts<T extends { accountId: string; scheduledFor: string; nextAttemptAt: string }>(posts: T[], budget: number) {
  const picked: T[] = [];
  const usedAccounts = new Set<string>();
  const ordered = [...posts].sort((left, right) =>
    left.scheduledFor.localeCompare(right.scheduledFor)
    || left.nextAttemptAt.localeCompare(right.nextAttemptAt),
  );
  for (const post of ordered) {
    if (picked.length >= budget) break;
    if (usedAccounts.has(post.accountId)) continue;
    usedAccounts.add(post.accountId);
    picked.push(post);
  }
  return picked;
}

export async function processDuePosts(ownerUserId?: string, requestedLimit = 16) {
  const deadline = Date.now() + 40_000;
  const now = new Date().toISOString();
  const staleLock = new Date(Date.now() - 90_000).toISOString();
  const result = { found: 0, published: 0, advanced: 0, retried: 0, failed: 0, captionsRepaired: 0, campaignsPaused: 0, cancelled: 0 };
  const captionFieldRecovery = [eq(scheduledPosts.status, "failed"), like(scheduledPosts.lastError, "%Tried accessing nonexisting field (caption)%"), isNotNull(scheduledPosts.containerId)];
  if (ownerUserId) captionFieldRecovery.push(eq(scheduledPosts.ownerUserId, ownerUserId));
  await getDb().update(scheduledPosts).set({ status: "container_created", nextAttemptAt: now, lastError: null, lockedAt: null, lockToken: null, updatedAt: now }).where(and(...captionFieldRecovery));
  const duePeekFilters = [inArray(scheduledPosts.status, ["container_created", "pending", "retry"]), lte(scheduledPosts.nextAttemptAt, now)];
  if (ownerUserId) duePeekFilters.push(eq(scheduledPosts.ownerUserId, ownerUserId));
  const [duePeek] = await getDb().select({ id: scheduledPosts.id }).from(scheduledPosts).where(and(...duePeekFilters)).limit(1);
  const idleHousekeeping = new Date().getMinutes() % 5 === 0;
  try { await reconcileFinishedCampaigns(ownerUserId); } catch { /* campanha concluída no próximo ciclo se esta leitura falhar */ }
  if (ownerUserId || idleHousekeeping) {
    try { await reconcileQueueAndCampaigns(ownerUserId); } catch { /* a fila continua mesmo se a reconciliação falhar */ }
  }
  const [stuckProcessing] = await getDb().select({ id: scheduledPosts.id }).from(scheduledPosts).where(and(eq(scheduledPosts.status, "processing"), lte(scheduledPosts.lockedAt, staleLock))).limit(1);
  if (!duePeek) {
    if (stuckProcessing) {
      await getDb().update(scheduledPosts).set({ status: "container_created", lockToken: null, lockedAt: null, nextAttemptAt: now, lastError: null, updatedAt: now }).where(and(eq(scheduledPosts.status, "processing"), lte(scheduledPosts.lockedAt, staleLock), isNotNull(scheduledPosts.containerId), sql`${scheduledPosts.containerId} != ''`));
      await getDb().update(scheduledPosts).set({ status: "pending", lockToken: null, lockedAt: null, nextAttemptAt: now, lastError: null, updatedAt: now }).where(and(eq(scheduledPosts.status, "processing"), lte(scheduledPosts.lockedAt, staleLock), eq(scheduledPosts.attemptCount, 0)));
      await getDb().update(scheduledPosts).set({ status: "retry", lockToken: null, lockedAt: null, nextAttemptAt: now, lastError: null, updatedAt: now }).where(and(eq(scheduledPosts.status, "processing"), lte(scheduledPosts.lockedAt, staleLock)));
    }
    return result;
  }
  if (stuckProcessing) {
    await getDb().update(scheduledPosts).set({ status: "container_created", lockToken: null, lockedAt: null, nextAttemptAt: now, lastError: null, updatedAt: now }).where(and(eq(scheduledPosts.status, "processing"), lte(scheduledPosts.lockedAt, staleLock), isNotNull(scheduledPosts.containerId), sql`${scheduledPosts.containerId} != ''`));
    await getDb().update(scheduledPosts).set({ status: "pending", lockToken: null, lockedAt: null, nextAttemptAt: now, lastError: null, updatedAt: now }).where(and(eq(scheduledPosts.status, "processing"), lte(scheduledPosts.lockedAt, staleLock), eq(scheduledPosts.attemptCount, 0)));
    await getDb().update(scheduledPosts).set({ status: "retry", lockToken: null, lockedAt: null, nextAttemptAt: now, lastError: null, updatedAt: now }).where(and(eq(scheduledPosts.status, "processing"), lte(scheduledPosts.lockedAt, staleLock)));
  }
  const blockedAuth = new Date().getMinutes() % 10 === 0
    ? await getDb().select({ id: scheduledPosts.id, accountId: scheduledPosts.accountId, campaignId: scheduledPosts.campaignId }).from(scheduledPosts).where(and(inArray(scheduledPosts.status, ["pending", "retry", "container_created"]), lte(scheduledPosts.nextAttemptAt, now), sql`lower(coalesce(${scheduledPosts.lastError}, '')) like '%log in to www.instagram.com%'`)).limit(20)
    : [];
  if (blockedAuth.length) {
    const blockedIds = blockedAuth.map((row) => row.id);
    await getDb().update(scheduledPosts).set({ status: "failed", containerId: null, containerCaptionHash: null, lockedAt: null, lockToken: null, lastError: "A Meta bloqueou o acesso desta conta. Entre no Instagram, resolva o aviso e reconecte.", updatedAt: now }).where(inArray(scheduledPosts.id, blockedIds));
    await Promise.all(blockedAuth.map((row) => getDb().update(campaigns).set({ failedCount: sql`${campaigns.failedCount} + 1`, updatedAt: now }).where(eq(campaigns.id, row.campaignId))));
    await Promise.all([...new Set(blockedAuth.map((row) => row.accountId))].map((accountId) => getDb().update(accounts).set({ healthStatus: "Restrita", lastError: "A Meta pediu login no Instagram antes de publicar.", queueCount: sql`max(${accounts.queueCount} - 1, 0)`, updatedAt: now }).where(eq(accounts.id, accountId))));
  }
  const pace = await readPublishPace();
  const limit = Math.min(Math.max(requestedLimit, 1), paceLimit(pace));
  const dueWhere = (statuses: string[]) => {
    const filters = [inArray(scheduledPosts.status, statuses), lte(scheduledPosts.nextAttemptAt, now)];
    if (ownerUserId) filters.push(eq(scheduledPosts.ownerUserId, ownerUserId));
    return and(...filters);
  };
  const duePool: Array<typeof scheduledPosts.$inferSelect> = [];
  let due: Array<typeof scheduledPosts.$inferSelect> = [];
  const pageSize = 500;
  for (let offset = 0; due.length < limit; offset += pageSize) {
    const page = await getDb().select().from(scheduledPosts).where(dueWhere(["container_created", "pending", "retry"])).orderBy(asc(scheduledPosts.scheduledFor), asc(scheduledPosts.nextAttemptAt), asc(scheduledPosts.id)).limit(pageSize).offset(offset);
    duePool.push(...page);
    due = takeFairDuePosts(duePool, limit);
    if (page.length < pageSize) break;
  }
  result.found = due.length;
  const liveLimits = new Map<string, { used: number; total: number }>();
  const coversByCampaign = new Map<string, Array<typeof campaignMedia.$inferSelect>>();
  const actionsByConnection = new Map<string, number>();
  const maxActionsPerConnection = 1;
  const handlePost = async (post: typeof scheduledPosts.$inferSelect) => {
    if (isQueueAborted() || Date.now() + 2_000 > deadline) return;
    const lockToken = crypto.randomUUID();
    const claimedPost = and(eq(scheduledPosts.id, post.id), eq(scheduledPosts.lockToken, lockToken));
    const [claimed] = await getDb().update(scheduledPosts).set({ status: "processing", lockToken, lockedAt: now, updatedAt: now }).where(and(eq(scheduledPosts.id, post.id), eq(scheduledPosts.status, post.status))).returning({ id: scheduledPosts.id });
    if (!claimed) return;
    if (isQueueAborted()) {
      await getDb().update(scheduledPosts).set({ status: post.status, lockedAt: null, lockToken: null, updatedAt: new Date().toISOString() }).where(claimedPost);
      return;
    }
    if (Date.now() + 2_000 > deadline) {
      await getDb().update(scheduledPosts).set({ status: post.status, lockedAt: null, lockToken: null, updatedAt: new Date().toISOString() }).where(claimedPost);
      return;
    }
    try {
      const [[campaign], [account], [connection], [mediaItem]] = await Promise.all([
        getDb().select().from(campaigns).where(and(eq(campaigns.id, post.campaignId), eq(campaigns.ownerUserId, post.ownerUserId))).limit(1),
        getDb().select().from(accounts).where(and(eq(accounts.id, post.accountId), eq(accounts.ownerUserId, post.ownerUserId))).limit(1),
        post.connectionId ? getDb().select().from(metaConnections).where(and(eq(metaConnections.id, post.connectionId), eq(metaConnections.ownerUserId, post.ownerUserId))).limit(1) : Promise.resolve([]),
        post.mediaItemId ? getDb().select().from(campaignMedia).where(and(eq(campaignMedia.id, post.mediaItemId), eq(campaignMedia.ownerUserId, post.ownerUserId))).limit(1) : Promise.resolve([]),
      ]);
      if (!campaign || !account || !connection) throw new Error("A conta ainda não possui uma conexão Meta válida.");
      if (account.archivedAt) {
        await getDb().update(scheduledPosts).set({ status: "paused", lastError: "Conta arquivada; publicação preservada e pausada.", lockedAt: null, lockToken: null, updatedAt: new Date().toISOString() }).where(claimedPost);
        return;
      }
      if (connection.status !== "connected" && !isWorkerBudgetError(connection.lastError)) throw new Error("A conexão Meta desta conta precisa ser renovada.");
      if (campaign.mediaType === "STORIES" && mediaItem?.contentType === "image/png") throw new Error("Stories de imagem aceitam apenas JPG. Converta o PNG para JPG e crie uma nova campanha.");
      if ((actionsByConnection.get(connection.id) ?? 0) >= maxActionsPerConnection) {
        await getDb().update(scheduledPosts).set({ status: post.status, lockedAt: null, lockToken: null, updatedAt: new Date().toISOString() }).where(claimedPost);
        return;
      }
      const apiMode = connectionApiMode(connection.scopes);
      const graphVersionOverride = campaign.metaApiVersion === "v23.0" ? "v23.0" : null;
      const accessToken = await decryptToken(connection.tokenCiphertext, connection.tokenIv);
      let liveLimit = liveLimits.get(connection.id);
      if (!liveLimit) {
        const cached = { used: connection.publishingLimitUsed, total: connection.publishingLimitTotal };
        const quotaOk = cached.total > 0 && cached.used < cached.total - 2;
        if (quotaOk || Date.now() + 6_000 > deadline) {
          liveLimit = cached.total > 0 ? cached : { used: 0, total: 100 };
        } else {
          try {
            const limit = await getPublishingLimit(connection.instagramUserId, accessToken, apiMode); const data = limit.data?.[0];
            liveLimit = { used: data?.quota_usage ?? connection.publishingLimitUsed, total: data?.config?.quota_total ?? connection.publishingLimitTotal };
            await getDb().update(metaConnections).set({ publishingLimitUsed: liveLimit.used, publishingLimitTotal: liveLimit.total, lastSyncAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(metaConnections.id, connection.id));
          } catch { liveLimit = cached.total > 0 ? cached : { used: 0, total: 100 }; }
        }
        liveLimits.set(connection.id, liveLimit);
      }
      if (liveLimit.used >= liveLimit.total) {
        const health = deriveConnectedHealth({ quotaUsed: liveLimit.used, quotaTotal: liveLimit.total });
        await getDb().update(accounts).set({ healthStatus: health.healthStatus, lastError: health.lastError, updatedAt: new Date().toISOString() }).where(eq(accounts.id, account.id));
        throw new Error("O limite de publicações da Meta foi atingido para esta conta.");
      }
      const caption = normalizeCaption(post.captionOverride || "") || composeCampaignCaption(campaign.caption, campaign.hashtags, post.repeatIndex, { variations: parseCaptionVariations(campaign.captionVariations) });
      const captionProtocol = graphVersionOverride === "v23.0" ? "caption-v8-diagnostic-v23-multipart" : "caption-v9-form-body";
      const expectedCaptionHash = await captionContainerSignature(caption, captionProtocol);
      const reusableContainer = post.status === "container_created" && post.containerId && (campaign.mediaType === "STORIES" || post.containerCaptionHash === expectedCaptionHash);
      if (post.status === "container_created" && post.containerId && !reusableContainer) await logAttempt(post.id, post.ownerUserId, "caption_guard", "recreated", "O contêiner anterior não comprovava a legenda atual e foi recriado antes da publicação.");
      if (reusableContainer && post.containerId) {
        const status = await getContainerStatus(post.containerId, accessToken, apiMode, graphVersionOverride);
        if (status.status_code === "IN_PROGRESS") {
          await getDb().update(scheduledPosts).set({ status: "container_created", nextAttemptAt: new Date(Date.now() + CONTAINER_SETTLE_MS).toISOString(), lockedAt: null, lockToken: null, updatedAt: new Date().toISOString() }).where(claimedPost);
          await logAttempt(post.id, post.ownerUserId, "container_status", "waiting", status.status);
          result.advanced += 1; return;
        }
        if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
          const mediaDescription = campaign.mediaType === "STORIES"
            ? mediaItem?.contentType === "image/jpeg" ? "Story de imagem JPG" : "Story de vídeo"
            : "mídia";
          throw new Error(status.status && status.status !== status.status_code ? status.status : `A Meta não conseguiu processar o ${mediaDescription} (${status.status_code}). Verifique o formato e as dimensões do arquivo.`);
        }
        if (!(await campaignStillAllowsPublishing(post))) {
          await getDb().update(scheduledPosts).set({ status: "paused", containerId: null, containerCaptionHash: null, lastError: INACTIVE_CAMPAIGN_MESSAGE, lockedAt: null, lockToken: null, updatedAt: new Date().toISOString() }).where(claimedPost);
          await logAttempt(post.id, post.ownerUserId, "campaign_guard", "paused", INACTIVE_CAMPAIGN_MESSAGE);
          return;
        }
        const published = await publishContainer(connection.instagramUserId, post.containerId, accessToken, apiMode, graphVersionOverride);
        let captionWarning: string | null = null;
        let publishedPermalink: string | null = null;
        const captionFallback: string | null = null;
        const captionFallbackCommentId: string | null = null;
        if (campaign.mediaType !== "STORIES" && caption) {
          try {
            const verified = await verifyPublishedCaption(published.id, accessToken, caption, apiMode, graphVersionOverride);
            publishedPermalink = verified.permalink;
            if (!verified.confirmed) {
              const returned = Array.from(verified.returnedCaption || "").length;
              captionWarning = "Sem legenda";
              await logAttempt(post.id, post.ownerUserId, "verify_caption", "missing", `Sem legenda: a Meta retornou ${returned} caracteres depois da publicação.`);
            } else {
              await logAttempt(post.id, post.ownerUserId, "verify_caption", "verified", `Legenda confirmada com ${Array.from(caption).length} caracteres.`);
            }
          } catch (verificationError) {
            captionWarning = `A publicação foi concluída, mas a Meta não permitiu confirmar a legenda após três tentativas: ${verificationError instanceof Error ? verificationError.message : "falha de leitura"}. Nenhum comentário automático foi enviado; a fila continuará normalmente.`;
            await logAttempt(post.id, post.ownerUserId, "verify_caption", "unavailable", captionWarning);
          }
        }
        const [markedPublished] = await getDb().update(scheduledPosts).set({ status: "published", publishedMediaId: published.id, publishedPermalink, captionFallback, captionFallbackCommentId, publishedAt: new Date().toISOString(), lastError: captionWarning, lockedAt: null, lockToken: null, updatedAt: new Date().toISOString() }).where(claimedPost).returning({ id: scheduledPosts.id });
        if (!markedPublished) return;
        await getDb().update(campaigns).set({ publishedCount: sql`${campaigns.publishedCount} + 1`, updatedAt: new Date().toISOString() }).where(eq(campaigns.id, post.campaignId));
        await getDb().update(metaConnections).set({ publishingLimitUsed: sql`${metaConnections.publishingLimitUsed} + 1`, updatedAt: new Date().toISOString() }).where(eq(metaConnections.id, connection.id));
        liveLimits.set(connection.id, { ...liveLimit, used: liveLimit.used + 1 });
        const today = dateKey(campaign.timezone || "America/Sao_Paulo");
        await getDb().update(accounts).set({ postsToday: account.postsTodayDate === today ? sql`${accounts.postsToday} + 1` : 1, postsTodayDate: today, queueCount: sql`max(${accounts.queueCount} - 1, 0)`, ...(account.healthStatus === "Limite atingido" && liveLimit.used + 1 < liveLimit.total ? { healthStatus: "Saudável", lastError: null } : {}), updatedAt: new Date().toISOString() }).where(eq(accounts.id, account.id));
        await logAttempt(post.id, post.ownerUserId, "publish", "published", `${published.id} · API solicitada ${graphVersionOverride || "padrão"} · API processada ${published.apiVersion || "não informada"} · request ${published.requestId || "não informado"}`);
        try { await cooldownAccountQueue(post.accountId, 1); } catch { /* o post já foi confirmado; o pacing volta no próximo ciclo */ }
        await markCampaignIfFinished(post.campaignId);
        actionsByConnection.set(connection.id, (actionsByConnection.get(connection.id) ?? 0) + 1);
        result.published += 1; return;
      }
      let covers = coversByCampaign.get(campaign.id);
      if (!covers) {
        covers = await getDb().select().from(campaignMedia).where(and(eq(campaignMedia.campaignId, campaign.id), eq(campaignMedia.ownerUserId, post.ownerUserId), eq(campaignMedia.purpose, "cover"))).orderBy(asc(campaignMedia.sortOrder));
        coversByCampaign.set(campaign.id, covers);
      }
      const coverItem = covers.length ? covers[rotationIndex(`${post.mediaItemId}:${post.accountId}:${post.repeatIndex}`, covers.length)] : null;
      const container = await createMediaContainer({ instagramUserId: connection.instagramUserId, accessToken, mediaType: campaign.mediaType, mediaUrl: mediaItem?.publicUrl || campaign.mediaUrl, mediaContentType: mediaItem?.contentType, caption, shareToFeed: campaign.shareToFeed, coverUrl: coverItem?.publicUrl ?? null, apiMode, graphVersionOverride });
      const [savedContainer] = await getDb().update(scheduledPosts).set({ status: "container_created", containerId: container.id, containerCaptionHash: expectedCaptionHash, captionOverride: caption, attemptCount: post.attemptCount + 1, nextAttemptAt: new Date(Date.now() + CONTAINER_SETTLE_MS).toISOString(), lastError: null, lockedAt: null, lockToken: null, updatedAt: new Date().toISOString() }).where(claimedPost).returning({ id: scheduledPosts.id });
      if (!savedContainer) return;
      const captionCharacters = Array.from(caption).length;
      const captionBytes = new TextEncoder().encode(caption).length;
      await logAttempt(post.id, post.ownerUserId, "create_container", "created", `${container.id} · legenda anexada pelo protocolo ${expectedCaptionHash.split(":", 1)[0]} · transporte ${container.transport} · API solicitada ${graphVersionOverride || "padrão"} · API processada ${container.apiVersion || "não informada"} · request ${container.requestId || "não informado"} · ${captionCharacters} caracteres · ${captionBytes} bytes`);
      try { await cooldownAccountQueue(post.accountId, 1); } catch { /* o contêiner já foi salvo; o pacing volta no próximo ciclo */ }
      actionsByConnection.set(connection.id, (actionsByConnection.get(connection.id) ?? 0) + 1);
      result.advanced += 1;
    } catch (error) {
      try {
        const rescheduled = await retryOrFail(post, error, post.containerId ? "publish" : "create_container", lockToken);
        if (!rescheduled) return;
        if (post.connectionId && isRateLimitedError(error)) actionsByConnection.set(post.connectionId, maxActionsPerConnection);
        if (post.attemptCount + 1 >= post.maxAttempts) result.failed += 1; else result.retried += 1;
      } catch (retryError) {
        const message = retryError instanceof Error ? retryError.message : "Falha ao reagendar a publicação.";
        await getDb().update(scheduledPosts).set({ status: post.containerId ? "container_created" : "retry", lockedAt: null, lockToken: null, lastError: message.slice(0, 900), nextAttemptAt: new Date(Date.now() + 2 * 60_000).toISOString(), updatedAt: new Date().toISOString() }).where(claimedPost);
        result.retried += 1;
      }
    }
  };
  const workers = Math.min(pace === "economy" ? 6 : pace === "normal" ? 16 : 24, due.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: workers }, async () => {
    while (cursor < due.length && !isQueueAborted() && Date.now() + 2_000 < deadline) {
      const post = due[cursor];
      cursor += 1;
      if (post) {
        try { await handlePost(post); } catch { result.retried += 1; }
      }
    }
  }));
  if (!isQueueAborted() && Date.now() + 5_000 < deadline && !due.length && (ownerUserId || new Date().getMinutes() % 10 === 0)) {
    result.captionsRepaired += await repairFutureCaptions(ownerUserId);
  }
  return result;
}
