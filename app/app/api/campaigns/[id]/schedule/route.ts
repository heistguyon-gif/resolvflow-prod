import { and, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { accounts, campaignMedia, campaigns, metaConnections, scheduledPosts } from "../../../../../db/schema";
import { authErrorResponse, requireOwnerId } from "../../../../../lib/auth";
import { recordAuditEvent } from "../../../../../lib/audit";
import { operationalPostAccount } from "../../../../../lib/account-archive";
import { composeCampaignCaption } from "../../../../../lib/captions";
import { parseCaptionVariations } from "../../../../../lib/caption-variations";
import { NEXOFLOW_QUARANTINE, quarantineResponse } from "../../../../../lib/quarantine";
import { getMediaBucket } from "../../../../../lib/media-storage";
import { assertProfileSchedule, readProfileBinding, ProfileBindingError } from "../../../../../lib/profile-video-binding";
import { requireReadyProfileAccount } from "../../../../../lib/profile-video-binding-runtime";

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
    const ownerUserId = await requireOwnerId(request, "editor"); const { id } = await context.params;
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
    if (campaign.status === "archived") return Response.json({ error: "Esta campanha foi excluída e não permite novos envios." }, { status: 409 });
    if (campaign.status !== "draft" && campaign.status !== "paused") return Response.json({ error: "Esta campanha já foi agendada." }, { status: 409 });
    // Validate durable media identity BEFORE any resume/INSERT/UPDATE path.
    const mediaItems = await getDb().select().from(campaignMedia).where(and(eq(campaignMedia.ownerUserId, ownerUserId), eq(campaignMedia.campaignId, campaign.id), eq(campaignMedia.purpose, "content"))).orderBy(campaignMedia.sortOrder);
    if (!mediaItems.length) return Response.json({ error: "Esta campanha não possui arquivos enviados." }, { status: 409 });
    const profileAccountId = await readProfileBinding(mediaItems, ownerUserId, key => getMediaBucket().head(key));
    assertProfileSchedule(profileAccountId, accountIds, payload.distributionMode ?? campaign.distributionMode, payload.intervalMode);
    if (profileAccountId) {
      await requireReadyProfileAccount(ownerUserId, profileAccountId);
      const existingAccounts = await getDb().select({ accountId: scheduledPosts.accountId }).from(scheduledPosts).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), eq(scheduledPosts.campaignId, campaign.id)));
      if (existingAccounts.some(row => row.accountId !== profileAccountId)) throw new ProfileBindingError("A fila existente não corresponde ao perfil dos vídeos. Nenhuma retomada foi executada.");
    }
    const [alreadyQueued] = await getDb().select({ id: scheduledPosts.id }).from(scheduledPosts).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), eq(scheduledPosts.campaignId, campaign.id))).limit(1);
    if (alreadyQueued && campaign.status === "draft") {
      const nowIso = new Date().toISOString();
      const [changed] = await getDb().update(campaigns).set({ status: "scheduled", startAt: campaign.startAt ?? startAt.toISOString(), updatedAt: nowIso }).where(and(eq(campaigns.id, campaign.id), eq(campaigns.ownerUserId, ownerUserId), eq(campaigns.status, "draft"))).returning({ id: campaigns.id });
      if (!changed) return Response.json({ error: "A campanha mudou. Atualize a lista antes de confirmar." }, { status: 409 });
      await getDb().update(scheduledPosts).set({ status: "pending", lastError: null, updatedAt: nowIso }).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), eq(scheduledPosts.campaignId, campaign.id), eq(scheduledPosts.status, "paused"), operationalPostAccount(), eq(scheduledPosts.lastError, "A publicação foi interrompida porque a campanha não está ativa."), sql`exists(select 1 from campaigns c where c.id=${campaign.id} and c.owner_user_id=${ownerUserId} and c.status='scheduled')`));
      return Response.json({ queued: 0, blocked: 0, resumed: true });
    }
    const selectedAccounts: Array<typeof accounts.$inferSelect> = [];
    for (let index = 0; index < accountIds.length; index += 80) {
      const chunk = await getDb().select().from(accounts).where(and(eq(accounts.ownerUserId, ownerUserId), inArray(accounts.id, accountIds.slice(index, index + 80)), isNull(accounts.archivedAt)));
      selectedAccounts.push(...chunk);
    }
    if (selectedAccounts.length !== accountIds.length) return Response.json({ error: "Uma ou mais contas selecionadas estão arquivadas ou não existem. Restaure e reconecte essas contas antes de agendar." }, { status: 409 });
    if (!selectedAccounts.length) return Response.json({ error: "Nenhuma das contas selecionadas foi encontrada." }, { status: 400 });
    const connections = await getDb().select().from(metaConnections).where(and(eq(metaConnections.ownerUserId, ownerUserId), eq(metaConnections.status, "connected")));
    const connectionByIgId = new Map(connections.map((connection) => [connection.instagramUserId, connection]));
    let globalSequence = 0; let distributionSequence = 0; let captionSequence = 0; let windowLimited = false;
    const scheduledByConnection = new Map<string, number>();
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
        scheduledByConnection.set(connection.id, plannedForConnection + 1);
      }
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
    const columns = getTableColumns(scheduledPosts);
    // The campaign gate is evaluated in every INSERT, not just before preparing the plan.
    // Two rows per statement keep bind parameters below D1's limit including defaults.
    for (let index = 0; index < queuedRows.length; index += 2) {
      const selects = queuedRows.slice(index, index + 2).map((row) => {
        const values = Object.entries(columns).map(([key, column]) => {
          const value = row[key as keyof typeof row];
          return value !== undefined ? sql`${value}` : column.default !== undefined ? sql`${column.default}` : sql`null`;
        });
        const expectedMedia = mediaItems.find(item => item.id === row.mediaItemId)!;
        return sql`select ${sql.join(values, sql`, `)} where exists(select 1 from campaigns c where c.id=${campaign.id} and c.owner_user_id=${ownerUserId} and c.status=${campaign.status}) and exists(select 1 from accounts a where a.id=${row.accountId} and a.owner_user_id=${ownerUserId} and a.archived_at is null) and exists(select 1 from campaign_media m where m.id=${row.mediaItemId} and m.campaign_id=${campaign.id} and m.owner_user_id=${ownerUserId} and m.purpose='content' and m.object_key=${expectedMedia.objectKey})`;
      });
      statements.push(db.insert(scheduledPosts).select(sql.join(selects, sql` union all `)).onConflictDoNothing().returning({ id: scheduledPosts.id, status: scheduledPosts.status, accountId: scheduledPosts.accountId }));
    }
    const inserted: Array<{ id: string; status: string; accountId: string }> = [];
    for (let index = 0; index < statements.length; index += 20) {
      const group = statements.slice(index, index + 20);
      if (group.length === 1) inserted.push(...await group[0]);
      else inserted.push(...(await db.batch(group as [typeof group[0], ...(typeof group)])).flat());
    }
    const queued = inserted.filter((row) => row.status === "pending").length;
    const blocked = inserted.length - queued;
    const total = queued + blocked;
    const insertedAccounts = [...new Set(inserted.map((row) => row.accountId))];
    const skipped = queuedRows.length - total;
    const result = { queued, blocked, total, accounts: insertedAccounts.length, skipped, media: mediaItems.length, intervalMode, windowLimited };
    if (!total) return Response.json({ ...result, error: "As contas ou a campanha mudaram durante o agendamento. Nenhuma publicação foi adicionada." }, { status: 409 });
    const [changed] = await getDb().update(campaigns).set({ status: "scheduled", startAt: startAt.toISOString(), stopAt: stopAt?.toISOString() ?? null, intervalMinutes, repeatCount, distributionMode, mediaOrder, respectDailyLimit, totalAccounts: sql`(select count(*) from scheduled_posts p where p.campaign_id=${campaign.id} and p.owner_user_id=${ownerUserId})`, updatedAt: new Date().toISOString() }).where(and(eq(campaigns.id, campaign.id), eq(campaigns.ownerUserId, ownerUserId), eq(campaigns.status, campaign.status))).returning({ id: campaigns.id });
    if (!changed) return Response.json({ ...result, error: "A campanha mudou durante o agendamento. Nenhum envio pode ser habilitado para uma campanha excluída." }, { status: 409 });
    const queueEntries = insertedAccounts;
    for (let index = 0; index < queueEntries.length; index += 20) {
      await Promise.all(queueEntries.slice(index, index + 20).map((accountId) => db.update(accounts).set({ queueCount: sql`(select count(*) from scheduled_posts p join campaigns c on c.id=p.campaign_id and c.owner_user_id=p.owner_user_id where p.owner_user_id=${ownerUserId} and p.account_id=${accountId} and c.status!='archived' and p.status in ('pending','retry','container_created','processing','paused'))`, updatedAt: new Date().toISOString() }).where(and(eq(accounts.ownerUserId, ownerUserId), eq(accounts.id, accountId)))));
    }
    await recordAuditEvent(request, {
      ownerUserId,
      action: "campaign.schedule",
      entityType: "campaign",
      entityId: campaign.id,
      summary: `Campanha ${campaign.name} agendada para ${insertedAccounts.length} conta(s).`,
      metadata: { ...result, intervalMinutes, repeatCount, distributionMode, mediaOrder, respectDailyLimit },
    });
    return Response.json(skipped ? { ...result, partial: true, error: "Algumas contas ou a campanha mudaram durante o agendamento. Confira as publicações adicionadas antes de continuar." } : result, { status: skipped ? 409 : 200 });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    if (error instanceof ProfileBindingError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível agendar a campanha." }, { status: 500 });
  }
}
