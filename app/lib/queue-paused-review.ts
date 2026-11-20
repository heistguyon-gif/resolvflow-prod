import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, campaigns, metaConnections, publicationAttempts, scheduledPosts } from "../db/schema";
import { protectedCampaignPostEvidence, safelyCancellableCampaignPost } from "./campaign-publication-protection";
import { operationalPostAccount } from "./account-archive";
import { parseMetaAttemptMessage } from "./meta-diagnostics";
import { recordAuditEvent } from "./audit";

export const QUEUE_CANCEL_STAGE = "queue_cancel";
export const REVIEW_PAGE_SIZE = 25;
export const MAX_REVIEW_CANCEL = 50;
export const REVIEW_HEADERS = { "cache-control": "private, no-store" };

export function pausedForReview() {
  return and(eq(scheduledPosts.status, "paused"), protectedCampaignPostEvidence())!;
}

const archivedHistory = () => sql<number>`exists(select 1 from publication_attempts pa where pa.owner_user_id=${scheduledPosts.ownerUserId} and pa.scheduled_post_id=${scheduledPosts.id} and pa.stage='account_archive')`;

function reviewQuery(ownerUserId: string, filter: SQL) {
  return getDb().select({
    id: scheduledPosts.id, ownerUserId: scheduledPosts.ownerUserId, status: scheduledPosts.status,
    updatedAt: scheduledPosts.updatedAt, scheduledFor: scheduledPosts.scheduledFor, lastError: scheduledPosts.lastError,
    publishedAt: scheduledPosts.publishedAt, publishedMediaId: scheduledPosts.publishedMediaId, publishedPermalink: scheduledPosts.publishedPermalink,
    accountId: scheduledPosts.accountId, campaignId: scheduledPosts.campaignId, connectionId: scheduledPosts.connectionId,
    accountFound: accounts.id, username: accounts.username, accountUpdatedAt: accounts.updatedAt,
    archivedAt: accounts.archivedAt, connectionStatus: accounts.connectionStatus, healthStatus: accounts.healthStatus,
    campaignFound: campaigns.id, campaignName: campaigns.name, campaignStatus: campaigns.status, campaignUpdatedAt: campaigns.updatedAt,
    connectionFound: metaConnections.id, metaStatus: metaConnections.status, connectionUpdatedAt: metaConnections.updatedAt,
    protected: sql<number>`${protectedCampaignPostEvidence()}`,
    safe: sql<number>`${safelyCancellableCampaignPost()}`,
    operational: sql<number>`${operationalPostAccount()}`,
    archivedHistory: archivedHistory(),
  }).from(scheduledPosts)
    .leftJoin(accounts, and(eq(accounts.id, scheduledPosts.accountId), eq(accounts.ownerUserId, scheduledPosts.ownerUserId)))
    .leftJoin(campaigns, and(eq(campaigns.id, scheduledPosts.campaignId), eq(campaigns.ownerUserId, scheduledPosts.ownerUserId)))
    .leftJoin(metaConnections, and(eq(metaConnections.id, scheduledPosts.connectionId), eq(metaConnections.ownerUserId, scheduledPosts.ownerUserId)))
    .where(and(eq(scheduledPosts.ownerUserId, ownerUserId), filter));
}
type ReviewRow = Awaited<ReturnType<typeof reviewQuery>>[number];

async function snapshot(row: ReviewRow) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(row)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

function diagnosis(row: ReviewRow) {
  if (row.protected) return { reason: "Envio ou recibo protegido", instruction: "Em conferência: há evidência de envio ou recibo. Isso não confirma que a publicação foi concluída. Não será reenviada automaticamente. Abra os detalhes para investigar." };
  if (!row.safe) return { reason: "Execução reservada", instruction: "Há uma reserva de processamento. Atualize mais tarde; não cancele nem repita o envio por inferência." };
  if (!row.accountFound || !row.campaignFound) return { reason: "Cadastro indisponível", instruction: "Não foi possível localizar a conta ou campanha neste workspace. Confira o cadastro antes de agir." };
  if (row.archivedAt || row.archivedHistory) return { reason: "Conta ou histórico arquivado", instruction: "Esta publicação não pode ser retomada. Você pode cancelar a pendência elegível mantendo o histórico." };
  if (row.metaStatus !== "connected" || row.connectionStatus !== "Conectada" || row.healthStatus !== "Saudável") return { reason: "Conta indisponível para envio", instruction: "Confira a conexão e os avisos da conta. Nenhuma reconexão ou retomada será feita aqui; o cancelamento elegível preserva o histórico." };
  if (row.campaignStatus === "paused") return { reason: "Campanha atualmente pausada", instruction: "A campanha continua pausada. Cancele apenas o que não deseja manter; esta revisão não retoma a campanha." };
  if (row.campaignStatus !== "scheduled") return { reason: "Campanha fora de operação", instruction: "A situação atual da campanha não permite reagendar por esta revisão. Cancele somente as pendências elegíveis; a campanha não será reaberta." };
  return { reason: "Pausa mantida na publicação", instruction: "A campanha está ativa, mas esta publicação continua pausada. Se elegível, use o reagendamento existente ou cancele mantendo o histórico." };
}

export async function readPausedReview(ownerUserId: string, page: number, view: "pending" | "protected") {
  const db = getDb();
  const [totals] = await db.select({ total: sql<number>`count(*)`, protected: sql<number>`coalesce(sum(case when ${protectedCampaignPostEvidence()} then 1 else 0 end),0)`, eligible: sql<number>`coalesce(sum(case when ${safelyCancellableCampaignPost()} and exists(select 1 from accounts a where a.id=${scheduledPosts.accountId} and a.owner_user_id=${scheduledPosts.ownerUserId}) and exists(select 1 from campaigns c where c.id=${scheduledPosts.campaignId} and c.owner_user_id=${scheduledPosts.ownerUserId}) then 1 else 0 end),0)` })
    .from(scheduledPosts).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), eq(scheduledPosts.status, "paused")));
  const total = Number(totals.total); const protectedTotal = Number(totals.protected);
  const viewTotal = view === "protected" ? protectedTotal : total - protectedTotal;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(viewTotal / REVIEW_PAGE_SIZE)));
  const rows = await reviewQuery(ownerUserId, and(eq(scheduledPosts.status, "paused"), view === "protected" ? protectedCampaignPostEvidence() : sql`not ${protectedCampaignPostEvidence()}`)!)
    .orderBy(asc(scheduledPosts.id)).limit(REVIEW_PAGE_SIZE).offset((currentPage - 1) * REVIEW_PAGE_SIZE);
  const items = await Promise.all(rows.map(async row => ({
    id: row.id, status: row.status, updatedAt: row.updatedAt, scheduledFor: row.scheduledFor,
    publishedAt: row.publishedAt, publishedMediaId: row.publishedMediaId, publishedPermalink: row.publishedPermalink,
    accountId: row.accountId, campaignId: row.campaignId,
    username: row.username || "Conta indisponível", campaignName: row.campaignName || "Campanha indisponível",
    campaignStatus: row.campaignStatus, accountArchived: Boolean(row.archivedAt),
    lastError: parseMetaAttemptMessage(row.lastError).message || "Nenhum motivo histórico registrado.",
    ...diagnosis(row), reviewProtected: Boolean(row.protected),
    canCancel: Boolean(row.safe && row.accountFound && row.campaignFound),
    canReschedule: Boolean(row.safe && row.operational && row.campaignStatus === "scheduled" && row.metaStatus === "connected" && row.connectionStatus === "Conectada" && row.healthStatus === "Saudável"),
    snapshot: await snapshot(row),
  })));
  return { items, total, protectedTotal, eligibleTotal: Number(totals.eligible), viewTotal, page: currentPage, pageSize: REVIEW_PAGE_SIZE, view };
}

// Recount current rows atomically; never decrement twice after a repeated request.
export function recountQueue(ownerUserId: string, accountId: string) {
  return getDb().update(accounts).set({ queueCount: sql`case when ${accounts.archivedAt} is null then (select count(*) from scheduled_posts p where p.owner_user_id=${ownerUserId} and p.account_id=${accountId} and p.status in ('pending','retry','container_created','processing','paused')) else 0 end` })
    .where(and(eq(accounts.id, accountId), eq(accounts.ownerUserId, ownerUserId)));
}

export function cancellationEvidence(ownerUserId: string, guard: SQL, message: string) {
  return getDb().insert(publicationAttempts).select(getDb().select({
    id: sql<string>`lower(hex(randomblob(16)))`.as("id"), ownerUserId: scheduledPosts.ownerUserId, scheduledPostId: scheduledPosts.id,
    stage: sql<string>`${QUEUE_CANCEL_STAGE}`.as("stage"), outcome: sql<string>`'cancelled'`.as("outcome"),
    metaErrorCode: sql<string>`null`.as("metaErrorCode"), message: sql<string>`${message}`.as("message"),
    createdAt: sql<string>`${new Date().toISOString()}`.as("createdAt"),
  }).from(scheduledPosts).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), guard)));
}

function unchanged(row: ReviewRow) {
  return and(eq(scheduledPosts.id, row.id), eq(scheduledPosts.ownerUserId, row.ownerUserId), eq(scheduledPosts.status, "paused"),
    eq(scheduledPosts.updatedAt, row.updatedAt), eq(scheduledPosts.scheduledFor, row.scheduledFor),
    eq(scheduledPosts.accountId, row.accountId), eq(scheduledPosts.campaignId, row.campaignId),
    sql`${scheduledPosts.connectionId} is ${row.connectionId}`, sql`${scheduledPosts.lastError} is ${row.lastError}`,
    safelyCancellableCampaignPost(), sql`${archivedHistory()} = ${row.archivedHistory}`,
    sql`exists(select 1 from accounts a where a.id=${row.accountId} and a.owner_user_id=${row.ownerUserId} and a.updated_at=${row.accountUpdatedAt} and a.archived_at is ${row.archivedAt} and a.connection_status is ${row.connectionStatus} and a.health_status is ${row.healthStatus})`,
    sql`exists(select 1 from campaigns c where c.id=${row.campaignId} and c.owner_user_id=${row.ownerUserId} and c.status is ${row.campaignStatus} and c.updated_at=${row.campaignUpdatedAt})`,
    row.connectionFound
      ? sql`exists(select 1 from meta_connections c where c.id=${row.connectionId} and c.owner_user_id=${row.ownerUserId} and c.status is ${row.metaStatus} and c.updated_at=${row.connectionUpdatedAt})`
      : sql`not exists(select 1 from meta_connections c where c.id=${row.connectionId} and c.owner_user_id=${row.ownerUserId})`)!;
}

export async function cancelReviewedPosts(request: Request, ownerUserId: string, selected: Array<{ id: string; snapshot: string }>) {
  const rows = await reviewQuery(ownerUserId, inArray(scheduledPosts.id, selected.map(item => item.id)));
  const pending: ReviewRow[] = [];
  const outcomes: Array<{ id: string; outcome: "cancelled" | "unchanged" | "unknown" }> = [];
  for (const item of selected) {
    const row = rows.find(row => row.id === item.id);
    if (!row || row.status !== "paused" || !row.safe || !row.accountFound || !row.campaignFound || await snapshot(row) !== item.snapshot) outcomes.push({ id: item.id, outcome: "unchanged" });
    else pending.push(row);
  }
  const db = getDb();
  for (let offset = 0; offset < pending.length; offset += 10) {
    const group = pending.slice(offset, offset + 10);
    const writes = group.flatMap(row => {
      const guard = unchanged(row);
      return [cancellationEvidence(ownerUserId, guard, "Cancelamento explícito na revisão de pausadas; histórico preservado."),
        db.update(scheduledPosts).set({ status: "cancelled", updatedAt: new Date().toISOString() }).where(guard).returning({ id: scheduledPosts.id })];
    });
    const counters = [...new Set(group.map(row => row.accountId))].map(id => recountQueue(ownerUserId, id));
    try {
      const results = await db.batch([...writes, ...counters] as [typeof writes[number], ...Array<typeof writes[number] | typeof counters[number]>]);
      group.forEach((row, index) => outcomes.push({ id: row.id, outcome: (results[index * 2 + 1] as Array<{ id: string }>).length ? "cancelled" : "unchanged" }));
    } catch {
      // A lost D1 response cannot prove rollback. Do not retry this group or later groups.
      pending.slice(offset).forEach(row => outcomes.push({ id: row.id, outcome: "unknown" }));
      break;
    }
  }
  const cancelled = outcomes.filter(item => item.outcome === "cancelled").length;
  const unknown = outcomes.filter(item => item.outcome === "unknown").length;
  const warnings: string[] = [];
  try { await recordAuditEvent(request, { ownerUserId, action: "queue.cancel_reviewed", entityType: "scheduled_post", summary: `${cancelled} pendência(s) pausada(s) cancelada(s), ${unknown} resultado(s) não confirmado(s).`, metadata: { selected: selected.length, cancelled, unchanged: outcomes.length - cancelled - unknown, unknown } }); }
  catch { warnings.push("Não foi possível registrar a auditoria. Confira o resultado atual antes de outra ação."); }
  return { cancelled, unchanged: outcomes.length - cancelled - unknown, unknown, outcomes, warnings, refreshRequired: true };
}
