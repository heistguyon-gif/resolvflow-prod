"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminCreateUserForm } from "./AdminCreateUserForm";
import AdminUserOtpManager, { type AdminOtpTarget } from "./AdminUserOtpManager";
import styles from "./AdminUsersDirectory.module.css";

type Membership = { workspaceOwnerUserId: string; workspaceName: string; workspaceStatus: string; role: string; status: string;
  accounts: number; activeAccounts: number; connected: number; published: number; views: number; reach: number;
  walletBalanceCents: number; billingMode: string | null; otpApisCount: number; otpEnabledApisCount: number;
  otpOpenOrders: number; metaAccessMode: string; metaApps: Array<{ id: string; label: string; status: string; configured: boolean }> };
type User = { id: string; displayName: string; email: string; status: string; mustChangePassword: boolean;
  lastLoginAt: string | null; createdAt: string; isPlatformAdmin: boolean; memberships: Membership[] };
type DirectoryResponse = { users: User[]; total: number; page: number; pageSize: number; error?: string };

const count = (value: number) => new Intl.NumberFormat("pt-BR").format(value);
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const date = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Nunca";

export function AdminUsersDirectory({ query, onQueryChange, from, to, periodLabel, onOpenAnalysis, onOpenMetaApp }: {
  query: string; onQueryChange: (value: string) => void; from: string; to: string; periodLabel: string; onOpenAnalysis: (userId: string) => void; onOpenMetaApp: (workspaceOwnerUserId: string) => void;
}) {
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState(query);
  const [showCreate, setShowCreate] = useState(false);
  const [success, setSuccess] = useState("");
  const [data, setData] = useState<DirectoryResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [otpTarget, setOtpTarget] = useState<AdminOtpTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const timer = window.setTimeout(() => { setSearch(query); setPage(1); setSelectedId(null); }, 250); return () => window.clearTimeout(timer); }, [query]);
  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: search, status, page: String(page), pageSize: String(pageSize), from, to });
      const response = await fetch(`/api/admin/users?${params}`, { cache: "no-store", signal });
      const body = await response.json() as DirectoryResponse;
      if (!response.ok) throw new Error(body.error || "Não foi possível carregar os usuários.");
      setData(body); setError("");
    } catch (reason) {
      if (!signal.aborted) setError(reason instanceof Error ? reason.message : "Não foi possível carregar os usuários.");
    } finally { if (!signal.aborted) setLoading(false); }
  }, [search, status, page, pageSize, from, to]);
  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => void load(controller.signal), 0); return () => { window.clearTimeout(timer); controller.abort(); }; }, [load, revision]);

  const selected = useMemo(() => data?.users.find((user) => user.id === selectedId) || null, [data, selectedId]);
  const pages = Math.max(1, Math.ceil((data?.total || 0) / (data?.pageSize || pageSize)));
  const current = selected || (selectedId ? null : data?.users[0] || null);
  const memberships = current?.memberships || [];
  const selectUser = (id: string) => {
    setSelectedId(id); setOtpTarget(null);
    if (window.matchMedia("(max-width: 1080px)").matches) {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" }));
    }
  };

  return <section className={styles.directory} aria-label="Usuários da plataforma">
    <header className={styles.header}>
      <div><span className="panel-kicker">Pessoas e operações</span><h2>Diretório e workspaces</h2><p>Selecione uma pessoa para ver os dados dos seus workspaces e abrir as configurações.</p></div>
      <div className={styles.controls}>
        <label>Buscar por nome ou e-mail<input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Buscar usuário" aria-label="Buscar usuários por nome ou e-mail" /></label>
        <label>Filtrar status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); setSelectedId(null); }}><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label>
        <button type="button" onClick={() => setRevision((value) => value + 1)} disabled={loading}>Atualizar</button>
        <button type="button" className={styles.createButton} onClick={() => { setShowCreate((value) => !value); setSuccess(""); }} aria-expanded={showCreate}>{showCreate ? "Fechar formulário" : "Criar usuário"}</button>
      </div>
    </header>
    {showCreate ? <AdminCreateUserForm onCancel={() => setShowCreate(false)} onCreated={(createdEmail) => {
      setShowCreate(false); setSuccess(`Usuário ${createdEmail} criado. A troca da senha será exigida no primeiro login.`);
      onQueryChange(createdEmail); setPage(1); setSelectedId(null); setRevision((value) => value + 1);
    }} /> : null}
    {success ? <p className={styles.success} role="status">{success}</p> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <div className={styles.layout}>
      <div className={styles.list} aria-busy={loading}>
        <div className={styles.listHead}><strong>{count(data?.total || 0)} usuário(s)</strong><label>Por página <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); setSelectedId(null); }}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label><span aria-live="polite">{loading ? "Carregando..." : `Página ${page} de ${pages}`}</span></div>
        {data?.users.map((user) => {
          const primary = user.memberships.find((membership) => membership.role === "owner") || user.memberships[0];
          const active = current?.id === user.id;
          return <button type="button" key={user.id} className={`${styles.userRow} ${active ? styles.selected : ""}`} onClick={() => selectUser(user.id)} aria-pressed={active}>
            <span className={styles.avatar}>{user.displayName.slice(0, 2).toUpperCase()}</span>
            <span className={styles.identity}><strong>{user.displayName}</strong><small>{user.email}</small><em>{primary?.workspaceName || "Sem workspace"}</em></span>
            <span className={styles.rowStats}><strong>{count(primary?.connected || 0)} <small>contas</small></strong><strong>{primary?.billingMode === "supplier" ? "APIs próprias" : money(primary?.walletBalanceCents || 0)} <small>OTP</small></strong></span>
            <span className={user.status === "active" ? styles.active : styles.inactive}>{user.status === "active" ? "Ativo" : "Inativo"}</span>
          </button>;
        })}
        {!loading && !data?.users.length ? <p className={styles.empty}>Nenhum usuário encontrado para esta busca.</p> : null}
        <div className={styles.pagination}><button type="button" disabled={page <= 1 || loading} onClick={() => { setPage((value) => value - 1); setSelectedId(null); }}>Anterior</button><span>{page} / {pages}</span><button type="button" disabled={page >= pages || loading} onClick={() => { setPage((value) => value + 1); setSelectedId(null); }}>Próxima</button></div>
      </div>
      <div className={styles.detail} ref={detailRef}>
        {current ? <>
          <div className={styles.personHeading}><span className={styles.avatarLarge}>{current.displayName.slice(0, 2).toUpperCase()}</span><div><span className="panel-kicker">Conta de usuário</span><h3>{current.displayName}</h3><p>{current.email}</p></div></div>
          <div className={styles.profileFacts}><span><small>Acesso</small><strong>{current.isPlatformAdmin ? "Superadmin" : current.status === "active" ? "Ativo" : "Inativo"}</strong></span><span><small>Último login</small><strong>{date(current.lastLoginAt)}</strong></span><span><small>Criado em</small><strong>{date(current.createdAt)}</strong></span></div>
          <div className={styles.actions}><button type="button" onClick={() => onOpenAnalysis(current.id)}>Abrir dashboard do usuário</button></div>
          {memberships.length ? memberships.map((membership) => <section key={membership.workspaceOwnerUserId} className={styles.workspace}>
            <div className={styles.workspaceHeading}><div><span className="panel-kicker">Workspace · {membership.role}</span><h4>{membership.workspaceName}</h4></div><span className={membership.workspaceStatus === "active" ? styles.active : styles.inactive}>{membership.workspaceStatus === "active" ? "Ativo" : membership.workspaceStatus}</span></div>
            <div className={styles.metrics}><div><small>Contas conectadas</small><strong>{count(membership.connected)}</strong><span>{count(membership.accounts)} no histórico</span></div><div><small>Views · {periodLabel}</small><strong>{count(membership.views)}</strong><span>{count(membership.reach)} de alcance</span></div><div><small>Posts · {periodLabel}</small><strong>{count(membership.published)}</strong><span>Publicados no período</span></div><div><small>Gmail OTP · {membership.billingMode === "supplier" ? "APIs próprias" : "Carteira e PIX"}</small><strong>{membership.billingMode === "supplier" ? `${membership.otpEnabledApisCount}/${membership.otpApisCount} APIs ativas` : money(membership.walletBalanceCents)}</strong><span>{membership.billingMode === "supplier" ? "Saldo externo no detalhe das APIs" : "Saldo da carteira interna"} · {membership.otpOpenOrders} e-mail(s) aberto(s)</span></div></div>
            <div className={styles.integrationSummary}>
              <div><small>Apps Meta · {membership.metaAccessMode === "legacy" ? "legado" : "catálogo"}</small>
                <strong>{membership.metaApps.length ? `${membership.metaApps.length} disponível(is)` : "Nenhum atribuído"}</strong>
                <p>{membership.metaApps.map((app) => `${app.label} (${app.configured ? "configurado" : "indisponível"})`).join(" · ") || "Novas conexões por App do catálogo não estão liberadas."}</p></div>
              <div><small>Gmail OTP · {current.status === "active" && membership.status === "active" ? "acesso ativo" : "acesso inativo"}</small>
                <strong>{membership.billingMode === "supplier" ? "APIs próprias" : "Carteira e PIX"}</strong>
                <p>{membership.billingMode === "supplier" ? `${membership.otpEnabledApisCount}/${membership.otpApisCount} APIs ativas; saldo externo no detalhe das APIs` : `Saldo da carteira interna ${money(membership.walletBalanceCents)}`} · {membership.otpOpenOrders} e-mails abertos</p></div>
            </div>
            <div className={styles.actions}><button type="button" onClick={() => setOtpTarget({ accountUserId: current.id, workspaceOwnerUserId: membership.workspaceOwnerUserId, email: current.email, displayName: current.displayName, workspaceName: membership.workspaceName })}>Configurar Gmail OTP</button><button type="button" onClick={() => onOpenMetaApp(membership.workspaceOwnerUserId)}>Configurar App Meta</button></div>
          </section>) : <p className={styles.empty}>Este usuário ainda não está vinculado a um workspace.</p>}
          {otpTarget && otpTarget.accountUserId === current.id ? <AdminUserOtpManager key={`${otpTarget.accountUserId}:${otpTarget.workspaceOwnerUserId}`} target={otpTarget} onClose={() => setOtpTarget(null)} /> : null}
        </> : <p className={styles.empty}>{loading ? "Carregando conta..." : "Selecione um usuário para abrir os detalhes."}</p>}
      </div>
    </div>
  </section>;
}
