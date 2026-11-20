"use client";

import { useEffect, useId, useRef, useState } from "react";
import type {
  CampaignActivityFilter, CampaignActivityPost, CampaignActivityResponse,
  CampaignAttempt, CampaignPostActivityResponse,
} from "../../lib/campaign-activity-types";

type PollerOptions<T> = {
  url: string;
  isVisible: () => boolean;
  onSnapshot: (data: T) => void;
  onError: (message: string) => void;
  onPending: (pending: boolean) => void;
  fetcher?: typeof fetch;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setInterval>;
  unschedule?: typeof clearInterval;
  intervalMs?: number | null;
};

// One request at a time. Disposed queries cannot replace a newer filter or detail.
export function createCampaignActivityPoller<T>(options: PollerOptions<T>) {
  let stopped = false;
  let started = false;
  let running = false;
  let epoch = 0;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  const refresh = async () => {
    if (stopped || running || !options.isVisible()) return;
    running = true;
    const requestEpoch = ++epoch;
    controller = new AbortController();
    options.onPending(true);
    try {
      const response = await (options.fetcher ?? fetch)(options.url, {
        method: "GET", credentials: "same-origin", cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403
        ? "Não foi possível acessar esta campanha. Verifique sua sessão e permissão."
        : `Não foi possível consultar a atividade (HTTP ${response.status}).`);
      const data = await response.json() as T;
      if (!stopped && requestEpoch === epoch) options.onSnapshot(data);
    } catch (error) {
      if (!stopped && requestEpoch === epoch) options.onError(error instanceof Error
        ? error.message : "Não foi possível consultar a atividade.");
    } finally {
      if (!stopped && requestEpoch === epoch) {
        running = false;
        controller = null;
        options.onPending(false);
      }
    }
  };
  return {
    refresh,
    start() {
      if (started || stopped) return;
      started = true;
      void refresh();
      if (options.intervalMs !== null) timer = (options.schedule ?? setInterval)(() => { void refresh(); }, options.intervalMs ?? 15_000);
    },
    stop() {
      stopped = true;
      ++epoch;
      controller?.abort();
      if (timer !== undefined) (options.unschedule ?? clearInterval)(timer);
    },
  };
}

type Snapshot<T> = { key: string | null; data: T | null; error: string | null; pending: boolean };
export function useActivitySnapshot<T>(url: string | null, visible: boolean, automatic = true) {
  const [snapshot, setSnapshot] = useState<Snapshot<T>>({ key: null, data: null, error: null, pending: false });
  const poller = useRef<ReturnType<typeof createCampaignActivityPoller<T>> | null>(null);
  useEffect(() => {
    if (!url || !visible) return;
    const active = createCampaignActivityPoller<T>({
      url,
      intervalMs: automatic ? 15_000 : null,
      isVisible: () => document.visibilityState === "visible",
      onSnapshot: (data) => setSnapshot({ key: url, data, error: null, pending: false }),
      onError: (error) => setSnapshot((current) => ({
        key: url, data: current.key === url ? current.data : null, error, pending: false,
      })),
      onPending: (pending) => setSnapshot((current) => current.key === url
        ? { ...current, pending } : { key: url, data: null, error: null, pending }),
    });
    poller.current = active;
    active.start();
    return () => { active.stop(); if (poller.current === active) poller.current = null; };
  }, [url, visible, automatic]);
  return {
    data: snapshot.key === url ? snapshot.data : null,
    error: snapshot.key === url ? snapshot.error : null,
    pending: snapshot.key === url && snapshot.pending,
    refresh: () => { void poller.current?.refresh(); },
  };
}

export function usePanelVisibility() {
  const root = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let intersects = true;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setVisible(document.visibilityState === "visible" && intersects
        && element.getClientRects().length > 0 && !element.closest('[hidden], [aria-hidden="true"]')
        && rect.bottom > 0 && rect.top < window.innerHeight);
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      intersects = entries[0]?.isIntersecting ?? false;
      update();
    });
    observer?.observe(element);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("resize", update);
    // Capture scrolls inside the campaign modal as well as window scrolls.
    document.addEventListener("scroll", update, true);
    update();
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, true);
    };
  }, []);
  return { root, visible };
}

export function campaignActivityTime(value: string | null, timezone: string) {
  if (!value) return "Não registrado";
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)
    ? value.replace(" ", "T") + "Z" : value;
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return "Horário indisponível";
  try {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, dateStyle: "short", timeStyle: "medium" }).format(date);
  } catch {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", dateStyle: "short", timeStyle: "medium" }).format(date) + " UTC";
  }
}

const statuses: Record<string, string> = {
  published: "Publicado", failed: "Falhou", pending: "Aguardando", processing: "Em publicação",
  retry: "Nova tentativa", container_created: "Mídia preparada",
  paused: "Pausado", cancelled: "Cancelado", blocked: "Bloqueado", waiting: "Aguardando",
  connected: "Conectado", disconnected: "Desconectado", error: "Com erro",
  healthy: "Saudável", degraded: "Atenção", expired: "Expirada", unknown: "Não verificado",
};
const label = (value: string | null) => value ? statuses[value] ?? value : "Não informado";
const number = (value: number) => value.toLocaleString("pt-BR");
const activeStatuses = new Set(["pending", "retry", "container_created", "processing"]);
const eventStages: Record<string, string> = {
  publish: "Publicação", container_status: "Verificação de processamento", create_container: "Preparação da mídia",
  verify_caption: "Verificação de legenda", verify_media: "Verificação da publicação", processing: "Processamento",
};
const eventOutcomes: Record<string, string> = {
  retry: "Nova tentativa", failed: "Falha", created: "Preparado", waiting: "Aguardando",
  published: "Publicado", success: "Concluído", blocked: "Bloqueado", processing: "Em processamento",
};

function AttemptHistory({ detail, timezone }: { detail: CampaignPostActivityResponse; timezone: string }) {
  return <div className="campaign-activity-history">
    <p className="campaign-activity-muted">Últimos 30 eventos, no máximo. {detail.hasMoreAttempts
      ? "Há eventos anteriores fora desta consulta." : "Todos os eventos disponíveis nesta consulta estão abaixo."}</p>
    <p className="campaign-activity-muted">Atualização do histórico: {campaignActivityTime(detail.fetchedAt, timezone)}</p>
    {detail.attempts.length === 0 ? <p>Nenhum evento registrado para este post.</p> :
      <ol className="campaign-activity-events">{detail.attempts.map((attempt) => <li key={attempt.id}>
        <div className="campaign-activity-event-heading"><strong>{eventStages[attempt.stage] ?? "Evento de publicação"} · {eventOutcomes[attempt.outcome] ?? "Evento registrado"}</strong>
          <time>{campaignActivityTime(attempt.createdAt, timezone)}</time></div>
        {attempt.message && <p>{attempt.message}</p>}
        <AttemptTechnical attempt={attempt} />
      </li>)}</ol>}
  </div>;
}

function AttemptTechnical({ attempt }: { attempt: CampaignAttempt }) {
  return <details className="campaign-activity-technical">
    <summary>Detalhes técnicos do evento</summary>
    <dl className="campaign-activity-facts">
      <div><dt>Etapa</dt><dd>{attempt.stage}</dd></div>
      <div><dt>Resultado técnico</dt><dd>{attempt.outcome}</dd></div>
      <div><dt>Código / subcódigo Meta</dt><dd>{attempt.metaCode ?? "—"} / {attempt.metaSubcode ?? "—"}</dd></div>
      <div><dt>HTTP</dt><dd>{attempt.httpStatus ?? "—"}</dd></div>
      {attempt.requestId && <div><dt>Identificador da requisição</dt><dd>{attempt.requestId}</dd></div>}
      {attempt.endpoint && <div><dt>Endpoint</dt><dd>{attempt.endpoint}</dd></div>}
      {attempt.retryAfterSeconds != null && <div><dt>Espera informada pela API</dt><dd>{attempt.retryAfterSeconds} s</dd></div>}
    </dl>
    {attempt.usage.map((usage, index) => <div className="campaign-activity-usage" key={`${usage.type}-${index}`}>
      <strong>Uso informado pela Meta · {usage.type}</strong>
      <p>Chamadas: {usage.callPercent == null ? "—" : `${usage.callPercent}%`} · CPU: {usage.cpuPercent == null ? "—" : `${usage.cpuPercent}%`} · Tempo: {usage.timePercent == null ? "—" : `${usage.timePercent}%`}</p>
      {usage.estimatedRecoveryMinutes != null && <p>Estimativa da Meta para recuperação: {usage.estimatedRecoveryMinutes} min. Não garante o horário da próxima tentativa.</p>}
    </div>)}
  </details>;
}

// Exported to exercise real presentation states without mounting the dashboard.
export function CampaignActivityPostCard({ post, timezone, open = false, onToggle, detail, detailError, detailPending, onRefresh }: {
  post: CampaignActivityPost; timezone: string; open?: boolean; onToggle: () => void;
  detail?: CampaignPostActivityResponse | null; detailError?: string | null; detailPending?: boolean; onRefresh: () => void;
}) {
  const historyId = useId();
  const current = open && detail ? detail.post : post;
  const hasMetrics = current.status === "published" || current.insightsSyncedAt != null;
  // A schema-default zero without a successful read is not a confirmed metric.
  const metric = (value: number | null) => value == null ? "Indisponível"
    : value === 0 && !current.insightsSyncedAt ? "Ainda sem leitura confirmada" : number(value);
  return <article className="campaign-activity-post">
    <div className="campaign-activity-post-heading">
      <div><strong className="campaign-activity-filename">{current.fileName || "Arquivo sem nome registrado"}</strong>
        <span className="campaign-activity-profile">@{current.username}</span></div>
      <span className={`campaign-activity-badge campaign-activity-severity-${current.diagnosis.severity}`}>{label(current.status)}</span>
    </div>
    <div className={`campaign-activity-diagnosis campaign-activity-severity-${current.diagnosis.severity}`}>
      <strong>{current.diagnosis.title}</strong>
      <p>{current.diagnosis.explanation}</p>
      {current.lastError && current.lastError !== current.diagnosis.explanation && <p><strong>Último motivo registrado:</strong> {current.lastError}</p>}
      {current.diagnosis.action && <p className="campaign-activity-action"><strong>Ação recomendada:</strong> {current.diagnosis.action}</p>}
    </div>
    <dl className="campaign-activity-facts">
      <div><dt>Agendado</dt><dd>{campaignActivityTime(current.scheduledFor, timezone)}</dd></div>
      {activeStatuses.has(current.status) && <div><dt>Próxima tentativa planejada</dt><dd>{campaignActivityTime(current.nextAttemptAt, timezone)}</dd></div>}
      {current.publishedAt && <div><dt>Confirmação de publicação</dt><dd>{campaignActivityTime(current.publishedAt, timezone)}</dd></div>}
      <div><dt>Tentativas contabilizadas</dt><dd>{current.attemptCount}/{current.maxAttempts}</dd></div>
      {current.lastAttempt && <div><dt>Último evento · {eventStages[current.lastAttempt.stage] ?? "Evento de publicação"}</dt><dd>{campaignActivityTime(current.lastAttempt.createdAt, timezone)}</dd></div>}
    </dl>
    <p className="campaign-activity-muted">Esperas de limite não consomem o contador de tentativas.</p>
    {hasMetrics && <div className="campaign-activity-metrics">
      <dl className="campaign-activity-facts">
        <div><dt>Visualizações</dt><dd>{metric(current.mediaViews)}</dd></div>
        <div><dt>Alcance</dt><dd>{metric(current.mediaReach)}</dd></div>
      </dl>
      <p className="campaign-activity-muted">Métricas lidas: {current.insightsSyncedAt ? campaignActivityTime(current.insightsSyncedAt, timezone) : "Ainda sem leitura confirmada"}</p>
      {current.insightsError && <p className="campaign-activity-warning"><strong>Leitura de métricas indisponível ou parcial:</strong> {current.insightsError}. Valores confirmados anteriores podem permanecer exibidos.</p>}
    </div>}
    <button type="button" className="campaign-activity-button" aria-expanded={open} aria-controls={historyId} onClick={onToggle}>
      {open ? "Fechar histórico" : "Ver histórico e detalhes"}
    </button>
    {open && <div id={historyId} className="campaign-activity-detail" aria-busy={detailPending}>
      {detailError && <div className="campaign-activity-warning" role="status">
        <p>{detail ? "Histórico desatualizado. " : ""}{detailError}</p>
        <button type="button" className="campaign-activity-button" disabled={detailPending} onClick={onRefresh}>Tentar consultar novamente</button>
      </div>}
      {!detail && !detailError && <p role="status">Carregando o histórico…</p>}
      {detail && <AttemptHistory detail={detail} timezone={timezone} />}
    </div>}
  </article>;
}

export function CampaignActivity({ campaignId, mode = "monitor" }: { campaignId: string; mode?: "monitor" | "report" }) {
  const { root, visible } = usePanelVisibility();
  const id = useId();
  const [filter, setFilter] = useState<CampaignActivityFilter>(mode === "report" ? "all" : "issues");
  const [accountId, setAccountId] = useState("");
  const [page, setPage] = useState(1);
  const [selectedPost, setSelectedPost] = useState<string | null>(null);
  const base = `/api/campaigns/${encodeURIComponent(campaignId)}/activity`;
  const query = new URLSearchParams({ state: filter, page: String(page) });
  if (accountId) query.set("accountId", accountId);
  const list = useActivitySnapshot<CampaignActivityResponse>(`${base}?${query}`, visible, mode !== "report");
  // Stop detail reads if a refreshed filter no longer contains the expanded row.
  const openedPost = list.data?.posts.find((post) => post.id === selectedPost)?.id ?? null;
  const detail = useActivitySnapshot<CampaignPostActivityResponse>(openedPost
    ? `${base}?${new URLSearchParams({ postId: openedPost })}` : null, visible, mode !== "report");
  const data = list.data;
  const timezone = data?.campaign.timezone || "America/Sao_Paulo";
  const changePage = (next: number) => { setPage(next); setSelectedPost(null); };
  const refresh = () => { list.refresh(); if (openedPost) detail.refresh(); };
  const summary = [
    ["published", "Publicados"], ["failed", "Falhas"], ["blocked", "Bloqueados"],
    ["waiting", "Aguardando"], ["delayed", "Atrasados"],
  ] as const;
  return <section ref={root} className="campaign-activity-panel" data-activity-mode={mode} aria-labelledby={`${id}-heading`}>
    <header className="campaign-activity-header">
      <div><h3 id={`${id}-heading`}>{mode === "report" ? "Histórico da campanha" : "Atividade da campanha"}</h3>
        <p>Publicações, esperas e motivos por perfil.</p></div>
      <button type="button" className="campaign-activity-button" disabled={list.pending || !visible} onClick={refresh}>
        {list.pending ? "Consultando…" : "Atualizar tela"}
      </button>
    </header>
    <p className="campaign-activity-muted">Atualização da tela: {data ? campaignActivityTime(data.fetchedAt, timezone) : "Aguardando consulta"} · Fuso: {timezone}</p>
    <p className="campaign-activity-muted">{mode === "report" ? "Consulta o histórico registrado; atualizar a tela não sincroniza com a Meta nem dispara posts." : "Atualiza automaticamente a cada 15 segundos enquanto visível."} Métricas e saúde mostram a última verificação disponível.</p>
    {list.error && <div className="campaign-activity-warning" role="status">
      <p><strong>{data ? "Dados desatualizados. " : "Consulta indisponível. "}</strong>{list.error}</p>
      <button type="button" className="campaign-activity-button" disabled={list.pending || !visible} onClick={refresh}>Tentar novamente</button>
    </div>}
    <p className="campaign-activity-muted">Resumo de toda a campanha. Os filtros abaixo afetam a lista de posts.</p>
    <div className="campaign-activity-summary">{summary.map(([key, title]) => <div className={`campaign-activity-summary-item campaign-activity-summary-${key}`} key={key}>
      <strong>{data ? number(data.summary[key]) : "—"}</strong><span>{title}</span>
    </div>)}</div>
    <p className="campaign-activity-muted">Aguardando indica esperas com motivo registrado. Atrasados podem também aparecer nessa contagem.</p>
    <div className="campaign-activity-controls">
      <label htmlFor={`${id}-state`}>Estado<select id={`${id}-state`} value={filter} onChange={(event) => {
        setFilter(event.target.value as CampaignActivityFilter); changePage(1);
      }}>
        <option value="issues">Ocorrências e avisos</option><option value="failed">Falhas e bloqueios</option>
        <option value="waiting">Aguardando</option><option value="published">Publicados</option><option value="all">Todos</option>
      </select></label>
      <label htmlFor={`${id}-account`}>Perfil<select id={`${id}-account`} value={accountId} onChange={(event) => {
        setAccountId(event.target.value); changePage(1);
      }}>
        <option value="">Todos os perfis</option>
        {data?.accounts.map((account) => <option key={account.id} value={account.id}>@{account.username}</option>)}
        {accountId && !data?.accounts.some((account) => account.id === accountId) && <option value={accountId}>Perfil selecionado</option>}
      </select></label>
    </div>
    {data && <details className="campaign-activity-accounts">
      <summary>Saúde dos perfis · {data.accounts.length}</summary>
      <div className="campaign-activity-account-list">{data.accounts.length ? data.accounts.map((account) => <details className="campaign-activity-account" key={account.id}>
        <summary><strong>@{account.username}</strong><span>{label(account.healthStatus)} · {label(account.connectionStatus)}</span></summary>
        <dl className="campaign-activity-facts">
          <div><dt>Publicados / total</dt><dd>{number(account.published)} / {number(account.total)}</dd></div>
          <div><dt>Falhas / bloqueados / aguardando</dt><dd>{number(account.failed)} / {number(account.blocked)} / {number(account.waiting)}</dd></div>
          <div><dt>Última verificação registrada</dt><dd>{campaignActivityTime(account.lastSyncAt, timezone)}</dd></div>
          <div><dt>Quota informada</dt><dd>{account.quotaUsed ?? "—"} / {account.quotaTotal ?? "—"}</dd></div>
        </dl>
        {account.lastError && <p className="campaign-activity-warning"><strong>Último erro:</strong> {account.lastError}</p>}
        <p className="campaign-activity-muted">Quota e saúde refletem a última leitura registrada; podem estar desatualizadas.</p>
      </details>) : <p>Nenhum perfil vinculado.</p>}</div>
    </details>}
    <div className="campaign-activity-results" aria-busy={list.pending}>
      {!data && !list.error && <p className="campaign-activity-empty" role="status">Carregando a atividade da campanha…</p>}
      {data?.posts.length === 0 && <p className="campaign-activity-empty">Nenhum post neste filtro. Selecione outro estado ou perfil para consultar.</p>}
      {data?.posts.map((post) => <CampaignActivityPostCard key={post.id} post={post} timezone={timezone}
        open={selectedPost === post.id} onToggle={() => setSelectedPost(selectedPost === post.id ? null : post.id)}
        detail={selectedPost === post.id ? detail.data : null} detailError={selectedPost === post.id ? detail.error : null}
        detailPending={selectedPost === post.id && detail.pending} onRefresh={detail.refresh} />)}
    </div>
    {data && <nav className="campaign-activity-pagination" aria-label="Páginas da atividade">
      <span>{number(data.pagination.total)} posts neste filtro · Página {data.pagination.page}</span>
      <div><button type="button" className="campaign-activity-button" disabled={page <= 1} onClick={() => changePage(page - 1)}>Anterior</button>
        <button type="button" className="campaign-activity-button" disabled={!data.pagination.hasMore} onClick={() => changePage(page + 1)}>Próxima</button></div>
    </nav>}
  </section>;
}
