"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./AdminWorkspaceView.module.css";

type Totals = { registeredAccounts: number; archivedAccounts: number; metaConnections: number; connectedProfiles: number;
  campaigns: number; scheduledCampaigns: number; published: number; views: number; reach: number; pending: number; failed: number };
type Profile = { id: string; username: string; displayName: string | null; lifecycle: string; archivedAt: string | null;
  healthStatus: string; connectionStatus: string; followers: number; connected: boolean };
type Campaign = { id: string; name: string; status: string; createdAt: string; totalAccounts: number;
  published: number; views: number; reach: number };
type Result = { workspace: { id: string; name: string; status: string }; totals: Totals; rows: Array<Profile | Campaign>;
  total: number; page: number; pageSize: number; error?: string };
type Section = "profiles" | "campaigns";
const nf = (value: number) => new Intl.NumberFormat("pt-BR").format(value || 0);

export function AdminWorkspaceView({ owner, from, to, periodLabel, onBack }: {
  owner: string; from: string; to: string; periodLabel: string; onBack: () => void;
}) {
  const [section, setSection] = useState<Section>("profiles");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("recent");
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => { const timer = window.setTimeout(() => { setSearch(query); setPage(1); }, 250); return () => window.clearTimeout(timer); }, [query]);
  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ workspaceOwnerUserId: owner, from, to, section, page: String(page), q: search, status, sort });
      const response = await fetch(`/api/admin/workspace?${params}`, { cache: "no-store", signal });
      const body = await response.json() as Result;
      if (!response.ok) throw new Error(body.error || "Falha ao carregar a operação.");
      setData(body); setError("");
    } catch (reason) {
      if (!signal.aborted) setError(reason instanceof Error ? reason.message : "Falha ao carregar a operação.");
    } finally { if (!signal.aborted) setLoading(false); }
  }, [owner, from, to, section, page, search, status, sort]);
  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => void load(controller.signal), 0); return () => { window.clearTimeout(timer); controller.abort(); }; }, [load, revision]);
  const totals = data?.totals;
  const pages = Math.max(1, Math.ceil((data?.total || 0) / (data?.pageSize || 20)));
  return <div className={styles.root}>
    <header className={styles.heading}>
      <div><button type="button" className={styles.back} onClick={onBack}>← Voltar à visão global</button><span className="panel-kicker">Operação em foco · somente leitura</span>
        <h2>{data?.workspace.name || (loading ? "Carregando workspace..." : "Workspace")}</h2>
        <p>{owner} · {periodLabel} · {data?.workspace.status || ""}</p></div>
      <button type="button" className={styles.refresh} onClick={() => setRevision(value => value + 1)} disabled={loading}>Atualizar</button>
    </header>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {totals ? <>
      <section className={styles.metrics} aria-label="Indicadores da operação">
        <article><span>Posts · {periodLabel}</span><strong>{nf(totals.published)}</strong><small>{nf(totals.views)} views · {nf(totals.reach)} de alcance</small></article>
        <article><span>Perfis conectados</span><strong>{nf(totals.connectedProfiles)}</strong><small>{nf(totals.metaConnections)} conexões Meta · {nf(totals.registeredAccounts)} contas cadastradas</small></article>
        <article><span>Campanhas</span><strong>{nf(totals.campaigns)}</strong><small>{nf(totals.scheduledCampaigns)} agendadas</small></article>
        <article><span>Fila e alertas</span><strong>{nf(totals.pending)}</strong><small>{nf(totals.failed)} falhas ou bloqueios · {nf(totals.archivedAccounts)} arquivadas</small></article>
      </section>
      <p className={styles.definition}>Perfis conectados são contas não arquivadas com ID canônico de Instagram e conexão Meta ativa para esse mesmo ID. Conexões Meta incluem o histórico de vínculos; contas cadastradas incluem arquivadas. Posts, views e alcance seguem o período; fila e status são atuais. Templates não entram em campanhas.</p>
    </> : loading ? <p className={styles.message} role="status">Carregando indicadores...</p> : null}
    <section className={styles.list} aria-label={section === "profiles" ? "Perfis" : "Campanhas"}>
      <div className={styles.tabs} role="group" aria-label="Listas da operação">
        <button type="button" aria-pressed={section === "profiles"} onClick={() => { setSection("profiles"); setStatus("all"); setPage(1); }}>Perfis</button>
        <button type="button" aria-pressed={section === "campaigns"} onClick={() => { setSection("campaigns"); setStatus("all"); setPage(1); }}>Campanhas</button>
      </div>
      <div className={styles.filters}>
        <label>Buscar {section === "profiles" ? "perfil" : "campanha"}<input value={query} onChange={event => setQuery(event.target.value)} maxLength={100} /></label>
        <label>Status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
          <option value="all">Todos</option>{section === "profiles" ? <><option value="connected">Conectados</option><option value="disconnected">Desconectados</option><option value="archived">Arquivados</option></> : <><option value="draft">Rascunho</option><option value="scheduled">Agendada</option><option value="paused">Pausada</option><option value="completed">Concluída</option><option value="cancelled">Cancelada</option></>}
        </select></label>
        <label>Ordenar<select value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><option value="recent">Mais recentes</option><option value="name">Nome A–Z</option></select></label>
      </div>
      <div aria-busy={loading} aria-live="polite">
        {loading ? <p className={styles.message}>Carregando lista...</p> : !data?.rows.length ? <p className={styles.message}>Nenhum resultado para estes filtros.</p> : <div className={styles.rows}>
          {section === "profiles" ? (data.rows as Profile[]).map(row => <article key={row.id}>
            <div><strong>@{row.username}</strong><small>{row.displayName || "Sem nome"} · {row.healthStatus}</small></div>
            <span>{row.archivedAt ? "Arquivado" : row.connected ? "Conectado" : "Desconectado"}</span><span>{nf(row.followers)} seguidores</span>
          </article>) : (data.rows as Campaign[]).map(row => <article key={row.id}>
            <div><strong>{row.name}</strong><small>{new Date(row.createdAt).toLocaleDateString("pt-BR")} · {nf(row.totalAccounts)} perfis previstos</small></div>
            <span>{row.status}</span><span>{nf(row.published)} posts · {nf(row.views)} views · {nf(row.reach)} alcance</span>
          </article>)}
        </div>}
      </div>
      <footer className={styles.pager}><span>{nf(data?.total || 0)} resultados · página {page} de {pages}</span><div><button type="button" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Anterior</button><button type="button" disabled={page >= pages || loading} onClick={() => setPage(value => value + 1)}>Próxima</button></div></footer>
    </section>
  </div>;
}
