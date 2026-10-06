"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./AdminAnalysisDashboard.module.css";

type User = { id: string; displayName: string; email: string };
type Analysis = {
  checkedAt: string;
  scope: { user: User | null; workspaces: Array<{ id: string; name: string }> };
  period: { from: string; to: string };
  previous: { from: string; to: string } | null;
  kpis: { views: number; posts: number; followers: number; successRate: number | null; resolved: number;
    failedInPeriod: number; previousViews: number; previousPosts: number };
  secondary: { registered: number; connected: number; archived: number; connections: number; campaigns: number;
    activeCampaigns: number; queue: number; failed: number };
  alerts: { failed: number; overdue: number; restricted: number; disconnected: number; lastSyncAt: string | null };
  series: Array<{ bucket: string; posts: number; views: number }>;
  ranking: { type: "workspaces" | "profiles" | "campaigns"; metric: "posts" | "views" | "reach";
    rows: Array<{ key: string; ownerUserId: string; label: string; workspaceName: string; posts: number; views: number; reach: number }> };
  error?: string;
};
type Section = "profiles" | "campaigns" | "queue";
type Profile = { id: string; ownerUserId: string; workspaceName: string; username: string; displayName: string | null;
  lifecycle: string; archived: boolean; healthStatus: string; connectionStatus: string; connected: boolean;
  followers: number; model: string; player: string; lastSyncAt: string | null; posts: number; views: number; reach: number };
type Campaign = { id: string; ownerUserId: string; workspaceName: string; name: string; status: string; createdAt: string;
  startAt: string | null; totalAccounts: number; intervalMinutes: number; distributionMode: string; mediaCount: number;
  posts: number; views: number; reach: number };
type QueuePost = { id: string; ownerUserId: string; workspaceName: string; account: string; campaign: string;
  status: string; scheduledFor: string; updatedAt: string; attemptCount: number };
type ListResult = { section: Section; rows: Array<Profile | Campaign | QueuePost>; total: number; page: number; pageSize: number; error?: string };
const nf = (value: number) => new Intl.NumberFormat("pt-BR").format(value || 0);
const count = (value: number, singular: string, plural: string) => `${nf(value)} ${value === 1 ? singular : plural}`;
const compact = (value: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
const chartLabel = (bucket: string) => /^\d{4}-\d{2}-\d{2}$/.test(bucket)
  ? `${bucket.slice(8)}/${bucket.slice(5, 7)}` : /^\d{4}-\d{2}$/.test(bucket)
    ? `${bucket.slice(5)}/${bucket.slice(2, 4)}` : bucket.replace(/^\d{4}-/, "");
const date = (value: string | null) => value && !Number.isNaN(new Date(value).getTime())
  ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Sem leitura registrada";
const sectionNames: Record<Section, string> = { profiles: "Perfis", campaigns: "Campanhas", queue: "Fila e falhas" };

function Comparison({ current, previous, enabled }: { current: number; previous: number; enabled: boolean }) {
  if (!enabled) return <span>Sem período anterior comparável</span>;
  if (!previous) return <span>Sem base no período anterior</span>;
  const change = Math.round((current - previous) / previous * 100);
  return <span className={change >= 0 ? styles.up : styles.down}>{change >= 0 ? "+" : ""}{change}% vs. período anterior</span>;
}

function Trend({ rows }: { rows: Analysis["series"] }) {
  const maxViews = Math.max(1, ...rows.map(row => row.views));
  const maxPosts = Math.max(1, ...rows.map(row => row.posts));
  return <div className={styles.chart} role="img" aria-label={`Série temporal: ${rows.map(row => `${row.bucket}: ${nf(row.views)} visualizações e ${count(row.posts, "post", "posts")}`).join("; ")}`}>
    {rows.map((row, index) => <div className={styles.chartItem} key={row.bucket} title={`${row.bucket}: ${nf(row.views)} views · ${count(row.posts, "post", "posts")}`}>
      <div className={styles.bars}><i style={{ height: row.views ? `${Math.max(5, row.views / maxViews * 100)}%` : 0, opacity: row.views ? 1 : 0 }} /><b style={{ height: row.posts ? `${Math.max(5, row.posts / maxPosts * 100)}%` : 0, opacity: row.posts ? 1 : 0 }} /></div>
      <span>{index % Math.max(1, Math.ceil(rows.length / 6)) === 0 || index === rows.length - 1 ? chartLabel(row.bucket) : ""}</span>
    </div>)}
  </div>;
}

export function AdminAnalysisDashboard({ from, to, periodLabel }: { from: string; to: string; periodLabel: string }) {
  const [urlReady, setUrlReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [usersError, setUsersError] = useState("");
  const [rankingMetric, setRankingMetric] = useState<"posts" | "views" | "reach">("posts");
  const [rankType, setRankType] = useState<"profiles" | "campaigns">("profiles");
  const [revision, setRevision] = useState(0);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [analysisError, setAnalysisError] = useState("");
  const [section, setSection] = useState<Section>("profiles");
  const [workspace, setWorkspace] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("recent");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<ListResult | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");

  useEffect(() => {
    const sync = () => {
      setUserId(new URLSearchParams(window.location.search).get("user"));
      setWorkspace(""); setSection("profiles"); setStatus("all"); setQuery(""); setSearch(""); setPage(1);
      setAnalysis(null); setList(null); setUrlReady(true);
    };
    const timer = window.setTimeout(sync, 0);
    window.addEventListener("popstate", sync);
    return () => { window.clearTimeout(timer); window.removeEventListener("popstate", sync); };
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { setSearch(query); setPage(1); }, 250); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => {
    if (!selectorOpen) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/analysis/users?${new URLSearchParams({ q: userQuery })}`, { signal: controller.signal, cache: "no-store" });
        const body = await response.json() as { users: User[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Busca indisponível.");
        setUsers(body.users); setUsersError("");
      } catch (reason) { if (!controller.signal.aborted) setUsersError(reason instanceof Error ? reason.message : "Busca indisponível."); }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [selectorOpen, userQuery]);
  const selectUser = (next: string | null) => {
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("user", next); else url.searchParams.delete("user");
    window.history.pushState({}, "", url);
    setUserId(next); setSelectorOpen(false); setUserQuery(""); setWorkspace("");
    setSection("profiles"); setStatus("all"); setQuery(""); setSearch(""); setPage(1);
    setAnalysis(null); setList(null);
  };
  const loadAnalysis = useCallback(async (signal: AbortSignal) => {
    setAnalysisLoading(true); setAnalysis(null);
    try {
      const params = new URLSearchParams({ from, to, ranking: rankingMetric, rankType });
      if (userId) params.set("userId", userId);
      const response = await fetch(`/api/admin/analysis?${params}`, { signal, cache: "no-store" });
      const body = await response.json() as Analysis;
      if (!response.ok) throw new Error(body.error || "Não foi possível carregar a análise.");
      setAnalysis(body); setAnalysisError("");
    } catch (reason) { if (!signal.aborted) setAnalysisError(reason instanceof Error ? reason.message : "Não foi possível carregar a análise."); }
    finally { if (!signal.aborted) setAnalysisLoading(false); }
  }, [from, to, rankingMetric, rankType, userId]);
  useEffect(() => { if (!urlReady) return; const controller = new AbortController(); const timer = window.setTimeout(() => void loadAnalysis(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); }; }, [loadAnalysis, revision, urlReady]);
  const loadList = useCallback(async (signal: AbortSignal) => {
    setListLoading(true); setList(null);
    try {
      const params = new URLSearchParams({ from, to, section, page: String(page), q: search, status, sort });
      if (userId) params.set("userId", userId);
      if (workspace) params.set("workspace", workspace);
      const response = await fetch(`/api/admin/analysis/lists?${params}`, { signal, cache: "no-store" });
      const body = await response.json() as ListResult;
      if (!response.ok) throw new Error(body.error || "Não foi possível carregar a lista.");
      setList(body); setListError("");
    } catch (reason) { if (!signal.aborted) setListError(reason instanceof Error ? reason.message : "Não foi possível carregar a lista."); }
    finally { if (!signal.aborted) setListLoading(false); }
  }, [from, to, section, page, search, status, sort, workspace, userId]);
  useEffect(() => { if (!urlReady) return; const controller = new AbortController(); const timer = window.setTimeout(() => void loadList(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); }; }, [loadList, revision, urlReady]);
  const focusList = (next: Section, nextStatus = "all") => {
    setSection(next); setStatus(nextStatus); setPage(1);
    document.getElementById("admin-analysis-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const kpis = analysis?.kpis;
  const secondary = analysis?.secondary;
  const alerts = analysis?.alerts;
  const ranking = analysis?.ranking;
  const pages = Math.max(1, Math.ceil((list?.total || 0) / (list?.pageSize || 20)));

  return <div className={styles.root}>
    <header className={styles.hero}>
      <div className={styles.heroTitle}><span className={styles.eyebrow}>Central de operações · visão administrativa</span>
        <h1>{userId ? analysis?.scope.user?.displayName || "Análise do usuário" : "Todas as contas."}</h1>
        <p>{userId ? `Desempenho reunido de ${count(analysis?.scope.workspaces.length || 0, "workspace", "workspaces")} deste usuário.` : "A operação inteira, incluindo o workspace do administrador."} Dados já registrados na plataforma; nenhuma sincronização é iniciada aqui.</p>
      </div>
      <div className={styles.heroActions}>
        <div className={styles.selector}>
          <button type="button" className={styles.scopeButton} onClick={() => setSelectorOpen(value => !value)} aria-expanded={selectorOpen} aria-controls="admin-user-options">
            <span><small>CONTEXTO</small><strong>{userId ? analysis?.scope.user?.displayName || "Usuário selecionado" : "Todas as contas"}</strong></span><b aria-hidden="true">⌄</b>
          </button>
          {selectorOpen ? <div className={styles.selectorMenu} id="admin-user-options">
            <label>Buscar usuário por nome ou e-mail<input value={userQuery} onChange={event => setUserQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setSelectorOpen(false); }} /></label>
            <div className={styles.options}><button type="button" onClick={() => selectUser(null)} className={!userId ? styles.optionActive : ""}>Todas as contas <small>Visão global</small></button>
              {users.map(user => <button type="button" key={user.id} onClick={() => selectUser(user.id)} className={userId === user.id ? styles.optionActive : ""}>
                {user.displayName}<small>{user.email}</small></button>)}
              {!users.length && !usersError ? <p>Nenhum usuário encontrado.</p> : null}{usersError ? <p role="alert">{usersError}</p> : null}</div>
          </div> : null}
        </div>
        {userId ? <button type="button" className={styles.globalButton} onClick={() => selectUser(null)}>Voltar ao global</button> : null}
        <button type="button" className={styles.refresh} disabled={analysisLoading || listLoading} onClick={() => setRevision(value => value + 1)}>
          {analysisLoading || listLoading ? "Atualizando..." : "Atualizar painel"}</button>
      </div>
    </header>
    <div className={styles.contextLine}><span>Período: {periodLabel}</span><span>Fonte: posts publicados, perfis e campanhas no D1</span><span>Sucesso: publicação pela data de publicação; falha final pela última atualização</span><span>Atualizado: {date(analysis?.checkedAt || null)}</span></div>
    {analysisError ? <div className={styles.error} role="alert">{analysisError} <button type="button" onClick={() => setRevision(value => value + 1)}>Tentar novamente</button></div> : null}
    {analysisLoading && !analysis ? <p className={styles.loading} role="status">Carregando indicadores da operação...</p> : null}
    {analysis ? <>
      <section className={styles.primary} aria-label="Indicadores principais">
        <article><div><span>Visualizações · {periodLabel}</span><i aria-hidden="true">✦</i></div><strong>{compact(kpis?.views || 0)}</strong><p>Soma das views dos posts publicados no período</p><Comparison current={kpis?.views || 0} previous={kpis?.previousViews || 0} enabled={Boolean(analysis.previous)} /></article>
        <article><div><span>Publicações · {periodLabel}</span><i aria-hidden="true">▣</i></div><strong>{nf(kpis?.posts || 0)}</strong><p>Posts efetivamente publicados no período</p><Comparison current={kpis?.posts || 0} previous={kpis?.previousPosts || 0} enabled={Boolean(analysis.previous)} /></article>
        <article><div><span>Seguidores</span><i aria-hidden="true">♙</i></div><strong>{compact(kpis?.followers || 0)}</strong><p>Última contagem disponível dos perfis canônicos ativos</p><small>Fotografia atual · não é soma por período</small></article>
        <article><div><span>Taxa de sucesso · {periodLabel}</span><i aria-hidden="true">✓</i></div><strong>{kpis?.successRate === null ? "—" : `${kpis?.successRate.toLocaleString("pt-BR")}%`}</strong><p>Publicados ÷ (publicados + falhas finais)</p><small>{count(kpis?.resolved || 0, "resultado resolvido", "resultados resolvidos")} · {count(kpis?.failedInPeriod || 0, "falha", "falhas")}</small></article>
      </section>
      <section className={styles.secondary} aria-label="Estado atual da operação">
        <div><span>Perfis conectados</span><strong>{nf(secondary?.connected || 0)}</strong><small>{nf(secondary?.connections || 0)} conexões Meta registradas</small></div>
        <div><span>Arquivados</span><strong>{nf(secondary?.archived || 0)}</strong><small>{nf(secondary?.registered || 0)} contas cadastradas</small></div>
        <div><span>Campanhas</span><strong>{nf(secondary?.campaigns || 0)}</strong><small>{nf(secondary?.activeCampaigns || 0)} agendadas ou pausadas</small></div>
        <div><span>Na fila</span><strong>{nf(secondary?.queue || 0)}</strong><small>{count(secondary?.failed || 0, "falha ou bloqueio atual", "falhas ou bloqueios atuais")}</small></div>
      </section>
      <div className={styles.middle}>
        <section className={styles.trendPanel}><div className={styles.panelHead}><div><span className={styles.kicker}>Desempenho no tempo</span><h2>Ritmo de publicação</h2></div><div className={styles.legend}><span><i />Views</span><span><i />Posts</span></div></div>
          {analysis.series.some(row => row.posts) ? <Trend rows={analysis.series} /> : <p className={styles.empty}>Nenhuma publicação neste período. Ajuste o período para ver o histórico.</p>}
          <footer><span>Views e posts de publicações concluídas · por {analysis.series[0]?.bucket.length === 10 ? "dia" : analysis.series[0]?.bucket.includes("W") ? "semana" : "mês"}</span>
            <span>Anterior: {analysis.previous ? `${count(kpis?.previousPosts || 0, "post", "posts")} · ${nf(kpis?.previousViews || 0)} views` : "sem comparação"}</span></footer>
        </section>
        <section className={styles.alertPanel}><div className={styles.panelHead}><div><span className={styles.kicker}>Leitura operacional</span><h2>Precisam de atenção</h2></div></div>
          <div className={styles.alertRows}>
            <button type="button" onClick={() => focusList("queue", "failed")}><span>Falhas e bloqueios</span><strong>{nf(alerts?.failed || 0)}</strong><small>Inspecionar posts</small></button>
            <button type="button" onClick={() => focusList("queue", "overdue")}><span>Fila atrasada</span><strong>{nf(alerts?.overdue || 0)}</strong><small>Inspecionar fila</small></button>
            <button type="button" onClick={() => focusList("profiles", "restricted")}><span>Perfis restritos</span><strong>{nf(alerts?.restricted || 0)}</strong><small>Inspecionar perfis</small></button>
            <button type="button" onClick={() => focusList("profiles", "disconnected")}><span>Vínculo desconectado</span><strong>{nf(alerts?.disconnected || 0)}</strong><small>Inspecionar perfis</small></button>
          </div><p className={styles.freshness}>Última sincronização Meta registrada: <strong>{date(alerts?.lastSyncAt || null)}</strong></p>
        </section>
      </div>
      <section className={styles.rankingPanel}><div className={styles.panelHead}><div><span className={styles.kicker}>Comparação · {periodLabel}</span>
        <h2>{userId ? rankType === "campaigns" ? "Campanhas em destaque" : "Perfis em destaque" : "Ranking por workspace"}</h2></div>
        <div className={styles.rankingControls}>{userId ? <label>Tipo<select value={rankType} onChange={event => setRankType(event.target.value as typeof rankType)}><option value="profiles">Perfis</option><option value="campaigns">Campanhas</option></select></label> : null}
          <label>Ordenar por<select value={rankingMetric} onChange={event => setRankingMetric(event.target.value as typeof rankingMetric)}><option value="posts">Posts</option><option value="views">Views</option><option value="reach">Alcance</option></select></label></div></div>
        {ranking?.rows.length ? <div className={styles.rankingRows}>{ranking.rows.map((row, index) => <button type="button" key={`${row.ownerUserId}:${row.key}`} onClick={() => {
          if (ranking.type === "workspaces") { setWorkspace(row.ownerUserId); focusList("profiles"); }
          else { focusList(ranking.type === "campaigns" ? "campaigns" : "profiles"); setQuery(row.label); }
        }}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{row.label}</strong><small>{row.workspaceName}</small></span>
          <i style={{ width: `${Math.max(4, row[rankingMetric] / Math.max(1, ranking.rows[0][rankingMetric]) * 100)}%` }} />
          <em>{nf(row[rankingMetric])}<small>{rankingMetric === "posts" ? row.posts === 1 ? "post" : "posts" : rankingMetric === "views" ? "views" : "alcance"}</small></em></button>)}</div>
          : <p className={styles.empty}>Sem publicações para ranquear neste período.</p>}
      </section>
    </> : null}
    <section id="admin-analysis-list" className={styles.listPanel} aria-label="Explorar dados da operação">
      <div className={styles.panelHead}><div><span className={styles.kicker}>Consulta detalhada · somente leitura</span><h2>Explorar a operação</h2></div><span className={styles.listTotal}>{nf(list?.total || 0)} resultados</span></div>
      <div className={styles.tabs} role="group" aria-label="Tipo de lista">{(["profiles", "campaigns", "queue"] as Section[]).map(item =>
        <button type="button" key={item} aria-pressed={section === item} onClick={() => { setSection(item); setStatus("all"); setSort("recent"); setQuery(""); setPage(1); }}>{sectionNames[item]}</button>)}</div>
      <div className={styles.filters}>
        {section !== "queue" ? <label>Buscar {section === "profiles" ? "perfil" : "campanha"}<input value={query} onChange={event => setQuery(event.target.value)} maxLength={100} placeholder="Nome ou @" /></label> : null}
        <label>Workspace<select value={workspace} onChange={event => { setWorkspace(event.target.value); setPage(1); }}><option value="">Todos os workspaces</option>
          {analysis?.scope.workspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">Todos</option>
          {section === "profiles" ? <><option value="connected">Conectados</option><option value="disconnected">Desconectados</option><option value="restricted">Restritos</option><option value="archived">Arquivados</option></>
            : section === "campaigns" ? <><option value="draft">Rascunho</option><option value="scheduled">Agendadas</option><option value="paused">Pausadas</option><option value="completed">Concluídas</option><option value="cancelled">Canceladas</option></>
              : <><option value="pending">Na fila</option><option value="overdue">Atrasados</option><option value="failed">Falhas</option></>}</select></label>
        {section !== "queue" ? <label>Ordenar<select value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}>
          <option value="recent">Mais recentes</option><option value="name">Nome A–Z</option>{section === "profiles" ? <option value="followers">Seguidores</option> : <option value="status">Status</option>}</select></label> : null}
      </div>
      {listError ? <p className={styles.error} role="alert">{listError} <button type="button" onClick={() => setRevision(value => value + 1)}>Tentar novamente</button></p> : null}
      <div aria-busy={listLoading} aria-live="polite">{listLoading ? <p className={styles.empty}>Carregando {sectionNames[section].toLowerCase()}...</p>
        : !list?.rows.length ? <p className={styles.empty}>Nenhum resultado com estes filtros.</p>
          : <div className={styles.listRows}>{section === "profiles" ? (list.rows as Profile[]).map(row => <details key={row.id}>
            <summary><span className={styles.listIdentity}><strong>@{row.username}</strong><small>{row.displayName || "Sem nome"} · {row.workspaceName}</small></span>
              <span className={styles.status}>{row.archived ? "Arquivado" : row.connected ? "Conectado" : "Desconectado"}</span>
              <span className={styles.listNumbers}>{count(row.posts, "post", "posts")} <b>{compact(row.views)} views</b></span></summary>
            <div className={styles.details}><span>Saúde <strong>{row.healthStatus}</strong></span><span>Modelo / player <strong>{row.model} · {row.player}</strong></span>
              <span>Seguidores <strong>{nf(row.followers)}</strong></span><span>Alcance no período <strong>{nf(row.reach)}</strong></span>
              <span>Última leitura Meta <strong>{date(row.lastSyncAt)}</strong></span></div></details>)
            : section === "campaigns" ? (list.rows as Campaign[]).map(row => <details key={row.id}><summary>
              <span className={styles.listIdentity}><strong>{row.name}</strong><small>{row.workspaceName} · criada em {date(row.createdAt)}</small></span>
              <span className={styles.status}>{row.status}</span><span className={styles.listNumbers}>{count(row.posts, "post", "posts")} <b>{compact(row.views)} views</b></span></summary>
              <div className={styles.details}><span>Perfis previstos <strong>{nf(row.totalAccounts)}</strong></span><span>Mídias <strong>{nf(row.mediaCount)}</strong></span>
                <span>Início <strong>{date(row.startAt)}</strong></span><span>Intervalo <strong>{row.intervalMinutes} min</strong></span>
                <span>Distribuição <strong>{row.distributionMode}</strong></span><span>Alcance no período <strong>{nf(row.reach)}</strong></span></div></details>)
              : (list.rows as QueuePost[]).map(row => <details key={row.id}><summary><span className={styles.listIdentity}><strong>@{row.account}</strong><small>{row.campaign} · {row.workspaceName}</small></span>
                <span className={styles.status}>{row.status}</span><span className={styles.listNumbers}>{date(row.scheduledFor)}</span></summary>
                <div className={styles.details}><span>Tentativas <strong>{nf(row.attemptCount)}</strong></span><span>Atualizado <strong>{date(row.updatedAt)}</strong></span></div></details>)}</div>}
      </div>
      <footer className={styles.pager}><span>Página {page} de {pages}</span><div><button type="button" disabled={page <= 1 || listLoading} onClick={() => setPage(value => value - 1)}>Anterior</button>
        <button type="button" disabled={page >= pages || listLoading} onClick={() => setPage(value => value + 1)}>Próxima</button></div></footer>
    </section>
  </div>;
}
