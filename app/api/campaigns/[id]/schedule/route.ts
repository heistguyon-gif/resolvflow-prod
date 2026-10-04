import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { accounts, campaignMedia, campaigns, metaConnections, scheduledPosts } from "../../../../../db/schema";
import { authErrorResponse, requireOwnerId } from "../../../../../lib/auth";
import { recordAuditEvent } from "../../../../../lib/audit";
import { composeCampaignCaption } from "../../../../../lib/captions";
import { parseCaptionVariations } from "../../../../../lib/caption-variations";
import { NEXOFLOW_QUARANTINE, quarantineResponse } from "../../../../../lib/quarantine";

function shuffleWithSeed<T>(items: T[], seed: string) {
  const out = [...items];
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  for (let index = out.length - 1; index > 0; index -= 1) {
    hash = Math.imul(hash, 1664525) + 1013904223 >>> 0;
    const swap = hash % (index + 1);
    [out[index], out[swap]] = [out[swap], out[index]];
  }
  return out;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerUserId = await requireOwnerId(request); const { id } = await context.params;
    if (NEXOFLOW_QUARANTINE) return quarantineResponse();
    const payload = await request.json() as { accountIds?: string[]; startAt?: string; stopAt?: string | null; intervalMinutes?: number; intervalMode?: string; accountIntervals?: Record<string, number>; repeatCount?: number; distributionMode?: string; mediaOrder?: string; respectDailyLimit?: boolean };
    const accountIds = [...new Set(payload.accountIds ?? [])].slice(0, 200);
    const startAt = new Date(payload.startAt ?? ""); const intervalMinutes = Math.min(Math.max(Number(payload.intervalMinutes) || 60, 5), 1440);
    const stopAt = payload.stopAt ? new Date(payload.stopAt) : null;
    const repeatCount = Math.min(Math.max(Number(payload.repeatCount) || 1, 1), 10);
    const distributionMode = payload.distributionMode === "distribute" ? "distribute" : "all_accounts";
    const mediaOrder = payload.mediaOrder === "random" ? "random" : "sequential";
    const requestedIntervalMode = payload.intervalMode === "per_account_custom" ? "per_account_custom" : payload.intervalMode === "global_queue" ? "global_queue" : "per_account_shared";
    const intervalMode = distributionMode === "distribute" ? "global_queue" : requestedIntervalMode;
    const respectDailyLimit = payload.respectDailyLimit !== false;
    if (!accountIds.length || Number.isNaN(startAt.getTime())) return Response.json({ error: "Selecione as contas e informe o início do agendamento." }, { status: 400 });
    if (stopAt && (Number.isNaN(stopAt.getTime()) || stopAt <= startAt)) return Response.json({ error: "O horário final precisa ser posterior ao início." }, { status: 400 });
    const [campaign] = await getDb().select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.ownerUserId, ownerUserId))).limit(1);
    if (!campaign) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
    if (campaign.status !== "draft" && campaign.status !== "paused") return Response.json({ error: "Esta campanha já foi agendada." }, { status: 409 });
    const [alreadyQueued] = await getDb().select({ id: scheduledPosts.id }).from(scheduledPosts).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), eq(scheduledPosts.campaignId, campaign.id))).limit(1);
    if (alreadyQueued && campaign.status === "draft") {
      const nowIso = new Date().toISOString();
      await getDb().update(campaigns).set({ status: "scheduled", startAt: campaign.startAt ?? startAt.toISOString(), updatedAt: nowIso }).where(eq(campaigns.id, campaign.id));
      await getDb().update(scheduledPosts).set({ status: "pending", lastError: null, updatedAt: nowIso }).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), eq(scheduledPosts.campaignId, campaign.id), eq(scheduledPosts.status, "paused"), eq(scheduledPosts.lastError, "A publicação foi interrompida porque a campanha não está ativa.")));
      return Response.json({ queued: 0, blocked: 0, resumed: true });
    }
    const selectedAccounts: Array<typeof accounts.$inferSelect> = [];
    for (let index = 0; index < accountIds.length; index += 80) {
      const chunk = await getDb().select().from(accounts).where(and(eq(accounts.ownerUserId, ownerUserId), inArray(accounts.id, accountIds.slice(index, index + 80)), isNull(accounts.archivedAt)));
      selectedAccounts.push(...chunk);
    }
    if (selectedAccounts.length !== accountIds.length) return Response.json({ error: "Uma ou mais contas selecionadas estão arquivadas ou não existem. Restaure e reconecte essas contas antes de agendar." }, { status: 409 });
    if (!selectedAccounts.length) return Response.json({ error: "Nenhuma das contas selecionadas foi encontrada." }, { status: 400 });
    const mediaItems = await getDb().select().from(campaignMedia).where(and(eq(campaignMedia.ownerUserId, ownerUserId), eq(campaignMedia.campaignId, campaign.id), eq(campaignMedia.purpose, "content"))).orderBy(campaignMedia.sortOrder);
    if (!mediaItems.length) return Response.json({ error: "Esta campanha não possui arquivos enviados." }, { status: 409 });
    const connections = await getDb().select().from(metaConnections).where(and(eq(metaConnections.ownerUserId, ownerUserId), eq(metaConnections.status, "connected")));
    const connectionByIgId = new Map(connections.map((connection) => [connection.instagramUserId, connection]));
    let queued = 0; let blocked = 0; let globalSequence = 0; let distributionSequence = 0; let captionSequence = 0; let windowLimited = false;
    const scheduledByConnection = new Map<string, number>(); const queuedByAccount = new Map<string, number>();
    const perAccountSequence = new Map<string, number>();
    const intervalByAccount = new Map(selectedAccounts.map((account) => [account.id, Math.min(Math.max(Number(payload.accountIntervals?.[account.id]) || intervalMinutes, 5), 1440)]));
    const queuedRows: Array<typeof scheduledPosts.$inferInsert> = [];
    const queueOne = (mediaItem: typeof mediaItems[number], account: typeof selectedAccounts[number], repeatIndex: number) => {
      const accountSequence = perAccountSequence.get(account.id) ?? 0;
      const appliedInterval = intervalMode === "per_account_custom" ? (intervalByAccount.get(account.id) ?? intervalMinutes) : intervalMinutes;
      const slot = intervalMode === "global_queue" ? globalSequence : accountSequence;
      const scheduledDate = new Date(startAt.getTime() + slot * appliedInterval * 60_000);
      if (stopAt && scheduledDate > stopAt) { windowLimited = true; return false; }
      const scheduledFor = scheduledDate.toISOString();
      const captionOverride = composeCampaignCaption(campaign.caption, campaign.hashtags, captionSequence, { username: account.username, variations: parseCaptionVariations(campaign.captionVariations), mediaCaption: mediaItem.caption });
      captionSequence += 1;
      if (intervalMode === "global_queue") globalSequence += 1;
      else perAccountSequence.set(account.id, accountSequence + 1);
      const connection = account.instagramAccountId ? connectionByIgId.get(account.instagramAccountId) : undefined;
      const plannedForConnection = connection ? (scheduledByConnection.get(connection.id) ?? 0) : 0;
      const dailyLimitReached = Boolean(connection && respectDailyLimit && connection.publishingLimitUsed + plannedForConnection >= connection.publishingLimitTotal);
      const status = connection && !dailyLimitReached ? "pending" : "blocked";
      const lastError = !connection ? "Conecte esta conta à Meta antes de publicar." : dailyLimitReached ? "O limite diário informado pela Meta seria ultrapassado." : null;
      queuedRows.push({ id: crypto.randomUUID(), ownerUserId, campaignId: campaign.id, mediaItemId: mediaItem.id, accountId: account.id, connectionId: connection?.id ?? null, repeatIndex, captionOverride, status, scheduledFor, nextAttemptAt: scheduledFor, lastError });
      if (status === "pending" && connection) {
        queued += 1; scheduledByConnection.set(connection.id, plannedForConnection + 1); queuedByAccount.set(account.id, (queuedByAccount.get(account.id) ?? 0) + 1);
      } else blocked += 1;
      return true;
    };
    const playlists = new Map<string, typeof mediaItems>();
    const playlistFor = (accountId: string) => {
      if (mediaOrder !== "random") return mediaItems;
      const cached = playlists.get(accountId);
      if (cached) return cached;
      const next = shuffleWithSeed(mediaItems, `${campaign.id}:${accountId}`);
      playlists.set(accountId, next);
      return next;
    };
    schedule: for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
      if (distributionMode === "distribute") {
        const playlist = mediaOrder === "random" ? shuffleWithSeed(mediaItems, `${campaign.id}:distribute:${repeatIndex}`) : mediaItems;
        for (const mediaItem of playlist) {
          const account = selectedAccounts[distributionSequence % selectedAccounts.length]; distributionSequence += 1;
          if (!queueOne(mediaItem, account, repeatIndex)) break schedule;
        }
      } else {
        for (let mediaIndex = 0; mediaIndex < mediaItems.length; mediaIndex += 1) {
          for (const account of selectedAccounts) {
            const withinWindow = queueOne(playlistFor(account.id)[mediaIndex], account, repeatIndex);
            if (!withinWindow && intervalMode === "global_queue") break schedule;
          }
        }
      }
    }
    const db = getDb();
    const statements = [];
    for (let index = 0; index < queuedRows.length; index += 6) statements.push(db.insert(scheduledPosts).values(queuedRows.slice(index, index + 6)).onConflictDoNothing());
    for (let index = 0; index < statements.length; index += 20) {
      const group = statements.slice(index, index + 20);
      if (group.length === 1) await group[0];
      else await db.batch(group as [typeof group[0], ...(typeof group)]);
    }
    const total = queued + blocked;
    await getDb().update(campaigns).set({ status: "scheduled", startAt: startAt.toISOString(), stopAt: stopAt?.toISOString() ?? null, intervalMinutes, repeatCount, distributionMode, mediaOrder, respectDailyLimit, totalAccounts: total, updatedAt: new Date().toISOString() }).where(eq(campaigns.id, campaign.id));
    const queueEntries = [...queuedByAccount];
    for (let index = 0; index < queueEntries.length; index += 20) {
      await Promise.all(queueEntries.slice(index, index + 20).map(([accountId, amount]) => db.update(accounts).set({ queueCount: sql`${accounts.queueCount} + ${amount}`, updatedAt: new Date().toISOString() }).where(and(eq(accounts.ownerUserId, ownerUserId), eq(accounts.id, accountId)))));
    }
    await recordAuditEvent(request, {
      ownerUserId,
      action: "campaign.schedule",
      entityType: "campaign",
      entityId: campaign.id,
      summary: `Campanha ${campaign.name} agendada para ${selectedAccounts.length} conta(s).`,
      metadata: { queued, blocked, total, accounts: selectedAccounts.length, media: mediaItems.length, intervalMinutes, repeatCount, distributionMode, mediaOrder, intervalMode, respectDailyLimit, windowLimited },
    });
    return Response.json({ queued, blocked, total, accounts: selectedAccounts.length, media: mediaItems.length, intervalMode, windowLimited });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível agendar a campanha." }, { status: 500 });
  }
}
