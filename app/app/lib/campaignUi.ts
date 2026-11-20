export type Campaign = {
  profileAccountId?: string | null;
  id: string; name: string; status: string; mediaType: string; mediaCount: number;
  caption?: string; captionVariations?: string[] | string; hashtags?: string; shareToFeed?: boolean;
  startAt?: string | null; stopAt?: string | null; createdAt?: string; timezone?: string;
  publishedCount?: number; failedCount?: number; totalAccounts?: number;
  intervalMinutes?: number; repeatCount?: number; distributionMode?: string; mediaOrder?: string; respectDailyLimit?: boolean;
};
export type CampaignMedia = { id: string; fileName: string; contentType: string; publicUrl: string; purpose: string; caption?: string };
export type CampaignAccount = { id: string; username: string; model?: string; connectionStatus?: string; lifecycle?: string; queueCount?: number | null };
export type CampaignProfileQueues = { fetchedAt: string; complete: true; total: number; accounts: { id: string; queueCount: number }[] };
export function campaignAccountQueueCount(account: Pick<CampaignAccount, "queueCount">) {
  return typeof account.queueCount === "number" && Number.isSafeInteger(account.queueCount) && account.queueCount >= 0 ? account.queueCount : null;
}
export function campaignProfileQueueGroups(accounts: CampaignAccount[]) {
  return {
    empty: accounts.filter(account => campaignAccountQueueCount(account) === 0),
    queued: accounts.filter(account => (campaignAccountQueueCount(account) ?? 0) > 0),
    unknown: accounts.filter(account => campaignAccountQueueCount(account) === null),
  };
}
export function selectCampaignAccountsWithoutQueue(selected: string[], accounts: CampaignAccount[], limit = 200) {
  const ids = [...new Set(selected)];
  const eligible = [...new Map(accounts.filter(account => account.connectionStatus === "Conectada" && account.lifecycle !== "caida" && campaignAccountQueueCount(account) === 0 && !ids.includes(account.id)).map(account => [account.id, account])).values()];
  const added = eligible.slice(0, Math.max(0, limit - ids.length)).map(account => account.id);
  return { ids: [...ids, ...added], added: added.length, omitted: eligible.length - added.length };
}
export function parseCampaignProfileQueues(value: unknown): CampaignProfileQueues {
  if (!value || typeof value !== "object" || Array.isArray(value) || "error" in value || !("fetchedAt" in value) || typeof value.fetchedAt !== "string" || !Number.isFinite(Date.parse(value.fetchedAt)) || !("accounts" in value) || !Array.isArray(value.accounts)
    || !("complete" in value) || value.complete !== true || !("total" in value) || typeof value.total !== "number" || !Number.isSafeInteger(value.total) || value.total < 0 || value.total !== value.accounts.length) throw new Error("Resposta de filas indisponível ou incompleta.");
  const ids = new Set<string>();
  const accounts = value.accounts.map(account => {
    if (!account || typeof account !== "object" || Array.isArray(account) || typeof account.id !== "string" || !account.id.trim() || campaignAccountQueueCount(account) === null || ids.has(account.id)) throw new Error("Resposta de filas indisponível ou incompleta.");
    ids.add(account.id);
    return { id: account.id as string, queueCount: account.queueCount as number };
  });
  return { fetchedAt: value.fetchedAt, complete: true, total: value.total, accounts };
}
export type CampaignBulkResult = { id: string; ok: boolean; campaign?: Campaign; error?: string; archived?: boolean;
  warnings?: string[]; archive?: { warnings?: string[]; inFlightPosts?: number }; };
export type CampaignMutationResult = { campaign?: Campaign; duplicate?: Campaign; template?: Campaign; warnings?: string[];
  updated?: boolean; paused?: number; resumed?: number; cancelled?: number; archived?: boolean;
  cancelledPosts?: number; protectedPosts?: number; inFlightPosts?: number; };
export type CampaignFetcher = (url: string, init?: RequestInit) => Promise<Response>;

export function campaignPhase(campaign: Campaign, now = Date.now()) {
  if (campaign.status !== "scheduled") return campaign.status;
  return (campaign.publishedCount ?? 0) > 0 || (campaign.startAt && new Date(campaign.startAt).getTime() <= now) ? "running" : "scheduled";
}
export function campaignPrimaryLabel(campaign: Campaign) {
  const phase = campaignPhase(campaign);
  return phase === "draft" ? "Configurar campanha" : phase === "completed" ? "Relatório"
    : phase === "running" || phase === "scheduled" ? "Acompanhar" : "Gerenciar";
}
export const campaignPhaseLabels: Record<string, string> = {
  draft: "Rascunho", running: "Em andamento", scheduled: "Agendada", paused: "Pausada", completed: "Concluída", cancelled: "Encerrada", archived: "Excluída",
};
export function campaignMediaLabel(mediaType: string) {
  const labels: Record<string, string> = { IMAGE: "Imagem", REELS: "Reel", STORIES: "Story" };
  return labels[mediaType] || "Mídia";
}
export function retainCampaignSelection(selected: string[], campaigns: Campaign[]) {
  const allowed = new Set(campaigns.filter(c => c.status !== "archived").map(c => c.id));
  return selected.filter(id => allowed.has(id));
}
export function toggleVisibleCampaigns(selected: string[], visibleIds: string[]) {
  const allSelected = visibleIds.length > 0 && visibleIds.every(id => selected.includes(id));
  return allSelected ? selected.filter(id => !visibleIds.includes(id)) : [...new Set([...selected, ...visibleIds])];
}
export function campaignVariations(value: Campaign["captionVariations"]): string[] {
  if (Array.isArray(value)) return value;
  try { const parsed: unknown = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []; }
  catch { return []; }
}
export async function campaignRequest<T>(fetcher: CampaignFetcher, url: string, init?: RequestInit): Promise<T> {
  const response = await fetcher(url, { credentials: "same-origin", cache: "no-store", ...init });
  let body: Record<string, unknown>;
  try { const parsed: unknown = await response.json(); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(); body = parsed as Record<string, unknown>; }
  catch { throw new Error(response.ok ? "Resposta inválida. O resultado não foi confirmado; confira o estado antes de repetir." : `Não foi possível concluir (HTTP ${response.status}). Confira o estado antes de repetir.`); }
  if (!response.ok) throw Object.assign(new Error(typeof body.error === "string" ? body.error : `Não foi possível concluir (HTTP ${response.status}).`), { archived: body.archived === true, status: response.status });
  return body as T;
}
export async function campaignMutation(fetcher: CampaignFetcher, id: string, action: string, fields: Record<string, unknown> = {}) {
  const result = await campaignRequest<CampaignMutationResult>(fetcher, `/api/campaigns/${encodeURIComponent(id)}`, {
    method: action === "delete" ? "DELETE" : "PATCH",
    ...(action === "delete" ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...fields }) }),
  });
  const counter = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0;
  const valid = action === "update" ? result.updated === true : action === "delete" ? result.archived === true && result.campaign?.status === "archived"
    : action === "pause" ? counter(result.paused) : action === "resume" ? counter(result.resumed) : action === "cancel" ? counter(result.cancelled)
    : action === "create_template" ? result.template?.status === "template" && !!result.template.id
    : action === "duplicate" ? result.duplicate?.status === "draft" && !!result.duplicate.id : action === "rename" ? result.campaign?.id === id && !!result.campaign.name : true;
  if (!valid) throw new Error("A resposta não confirmou a operação. Confira o estado antes de repetir.");
  return result;
}
export async function campaignBulk(fetcher: CampaignFetcher, action: "duplicate" | "delete", ids: string[], isCurrent: () => boolean = () => true): Promise<CampaignBulkResult[]> {
  // Explicit calls only, bounded batches. A failed/ambiguous batch is never retried automatically.
  const results: CampaignBulkResult[] = [];
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 50) {
    // Preserve submitted operations. Only stop batches that have not started in this UI session.
    if (!isCurrent()) {
      results.push(...unique.slice(i).map(id => ({ id, ok: false, error: "Não enviado: lista fechada ou workspace alterado. Os lotes já enviados não foram desfeitos." })));
      break;
    }
    const batch = unique.slice(i, i + 50);
    try {
      const data = await campaignRequest<{ results: CampaignBulkResult[] }>(fetcher, "/api/campaigns/bulk", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ids: batch }),
      });
      if (!Array.isArray(data.results)) throw new Error("Resposta incompleta. Consulte a lista antes de repetir a operação.");
      results.push(...batch.map(id => {
        const item = data.results.find(item => item.id === id) ?? { id, ok: false, error: "Resultado não informado; verifique antes de repetir." };
        if (action === "duplicate" && item.ok && item.campaign?.status !== "draft") return { id, ok: false, error: "A resposta não confirmou cópia em rascunho. Consulte a lista antes de repetir." };
        return item;
      }));
    } catch (error) {
      results.push(...batch.map(id => ({ id, ok: false, error: error instanceof Error ? error.message : "Consulta indisponível." })));
      results.push(...unique.slice(i + 50).map(id => ({ id, ok: false, error: "Não enviado após falha do lote anterior." })));
      break;
    }
  }
  return results;
}

export type ScheduleDraft = { accountIds: string[]; startAt: string; stopAt: string; intervalMinutes: number;
  intervalMode: "per_account_shared" | "per_account_custom" | "global_queue"; accountIntervals: Record<string, number>;
  repeatCount: number; distributionMode: "all_accounts" | "distribute"; mediaOrder: "random" | "sequential"; respectDailyLimit: boolean };
export function initialSchedule(campaign: Campaign): ScheduleDraft {
  const local = (value: string | number) => { const date = new Date(value); if (!Number.isFinite(date.getTime())) return ""; date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16); };
  return { accountIds: campaign.profileAccountId ? [campaign.profileAccountId] : [], startAt: local(campaign.startAt || Date.now() + 5 * 60_000), stopAt: campaign.stopAt ? local(campaign.stopAt) : "", intervalMinutes: campaign.intervalMinutes || 60,
    intervalMode: "per_account_shared", accountIntervals: {}, repeatCount: campaign.repeatCount || 1,
    distributionMode: campaign.distributionMode === "distribute" ? "distribute" : "all_accounts",
    mediaOrder: campaign.mediaOrder === "random" ? "random" : "sequential", respectDailyLimit: campaign.respectDailyLimit !== false };
}
export function scheduleStoredFields(schedule: ScheduleDraft, timezone = "America/Sao_Paulo") {
  if (!Number.isInteger(schedule.intervalMinutes) || schedule.intervalMinutes < 5 || schedule.intervalMinutes > 1440) throw new Error("O intervalo deve ser inteiro, de 5 a 1.440 minutos.");
  if (!Number.isInteger(schedule.repeatCount) || schedule.repeatCount < 1 || schedule.repeatCount > 10) throw new Error("Escolha de 1 a 10 repetições.");
  return { timezone, stopAt: schedule.stopAt ? new Date(schedule.stopAt).toISOString() : null,
    intervalMinutes: schedule.intervalMinutes, repeatCount: schedule.repeatCount, distributionMode: schedule.distributionMode, mediaOrder: schedule.mediaOrder, respectDailyLimit: schedule.respectDailyLimit };
}
export function campaignArchiveFeedback(result: CampaignMutationResult) {
  return `Campanha removida da lista. Histórico preservado; nenhuma publicação do Instagram foi removida.${typeof result.cancelledPosts === "number" ? ` ${result.cancelledPosts} próximos envios cancelados.` : ""}${typeof result.protectedPosts === "number" ? ` ${result.protectedPosts} posts com evidência preservada.` : ""}${typeof result.inFlightPosts === "number" ? ` ${result.inFlightPosts} envios em processamento podem finalizar.` : ""}${result.warnings?.length ? ` Avisos: ${result.warnings.join(" ")}` : ""}`;
}
export function scheduleValidation(schedule: ScheduleDraft) {
  if (!schedule.accountIds.length) return "Selecione pelo menos um perfil conectado.";
  if (schedule.accountIds.length > 200) return "Selecione no máximo 200 perfis por campanha.";
  const start = new Date(schedule.startAt).getTime(); const stop = schedule.stopAt ? new Date(schedule.stopAt).getTime() : null;
  if (!Number.isFinite(start)) return "Informe o início da programação.";
  if (stop !== null && (!Number.isFinite(stop) || stop <= start)) return "O fim deve ser posterior ao início.";
  if (!Number.isInteger(schedule.intervalMinutes) || schedule.intervalMinutes < 5 || schedule.intervalMinutes > 1440) return "O intervalo deve ser inteiro, de 5 a 1.440 minutos.";
  if (!Number.isInteger(schedule.repeatCount) || schedule.repeatCount < 1 || schedule.repeatCount > 10) return "Escolha de 1 a 10 repetições.";
  if (schedule.intervalMode === "per_account_custom" && schedule.accountIds.some(id => !Number.isFinite(schedule.accountIntervals[id] ?? schedule.intervalMinutes) || (schedule.accountIntervals[id] ?? schedule.intervalMinutes) < 5 || (schedule.accountIntervals[id] ?? schedule.intervalMinutes) > 1440)) return "Confira os intervalos de cada perfil.";
  return null;
}
export async function loadCampaignDetail(fetcher: CampaignFetcher, id: string, signal?: AbortSignal) {
  const data = await campaignRequest<{ campaign: Campaign; media: CampaignMedia[] }>(fetcher, `/api/campaigns/${encodeURIComponent(id)}`, { signal });
  if (!data.campaign || data.campaign.id !== id || typeof data.campaign.caption !== "string" || typeof data.campaign.mediaCount !== "number" || !data.campaign.mediaType) throw new Error("Detalhe incompleto. A edição permanece indisponível.");
  return data;
}
export function schedulePayload(schedule: ScheduleDraft) {
  const error = scheduleValidation(schedule); if (error) throw new Error(error);
  return { ...schedule, startAt: new Date(schedule.startAt).toISOString(), stopAt: schedule.stopAt ? new Date(schedule.stopAt).toISOString() : null,
    intervalMode: schedule.distributionMode === "distribute" ? "global_queue" : schedule.intervalMode };
}

export function scheduleEffectiveRhythm(schedule: ScheduleDraft) {
  if (schedule.distributionMode === "distribute" || schedule.intervalMode === "global_queue") return { mode: "global" as const, intervalMinutes: schedule.intervalMinutes, profiles: [] };
  if (schedule.intervalMode === "per_account_custom") return { mode: "custom" as const, intervalMinutes: schedule.intervalMinutes,
    profiles: schedule.accountIds.map(id => ({ id, intervalMinutes: schedule.accountIntervals[id] ?? schedule.intervalMinutes })) };
  return { mode: "shared" as const, intervalMinutes: schedule.intervalMinutes, profiles: [] };
}
