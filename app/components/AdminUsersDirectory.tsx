"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
type Section = "summary" | "analysis" | "otp" | "meta" | "settings";
const sections: Array<{ id: Section; label: string }> = [
  { id: "summary", label: "Resumo" }, { id: "analysis", label: "Análise" },
  { id: "otp", label: "Gmail OTP" }, { id: "meta", label: "Apps Meta" },
  { id: "settings", label: "Configurações" },
];

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
  const [section, setSection] = useState<Section>("summary");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => { const timer = window.setTimeout(() => { setSearch(query); setPage(1); }, 250); return () => window.clearTimeout(timer); }, [query]);
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

  const selected = data?.users.find((user) => user.id === selectedId) || null;
  const pages = Math.max(1, Math.ceil((data?.total || 0) / (data?.pageSize || pageSize)));
  const current = selected;
  const memberships = current?.memberships || [];
  const closeModal = useCallback(() => { setSelectedId(null); setOtpTarget(null); }, []);
  const openModal = (id: string, target: Section, trigger: HTMLElement) => {
    triggerRef.current = trigger; setSelectedId(id); setSection(target); setOtpTarget(null);
  };
  useEffect(() => {
    if (!selectedId) return;
    document.body.classList.add("adminUsersModalOpen");
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeModal(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!controls.length) { event.preventDefault(); dialogRef.current.focus(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.classList.remove("adminUsersModalOpen"); if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true }); };
  }, [selectedId, closeModal]);

  return <section className={styles.directory} aria-label="Usuários da plataforma">
    <header className={styles.header}>
      <div><span className="panel-kicker">Pessoas e operações</span><h2>Diretório e workspaces</h2><p>Abra uma pessoa para consultar análise, Gmail OTP, Apps Meta e configurações.</p></div>
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
    <div className={styles.list} aria-busy={loading}>
        <div className={styles.listHead}><strong>{count(data?.total || 0)} usuário(s)</strong><label>Por página <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); setSelectedId(null); }}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label><span aria-live="polite">{loading ? "Carregando..." : `Página ${page} de ${pages}`}</span></div>
        {data?.users.map((user) => {
          const primary = user.memberships.find((membership) => membership.role === "owner") || user.memberships[0];
          return <div key={user.id} className={styles.userRow}>
            <button type="button" className={styles.rowMain} onClick={(event) => openModal(user.id, "summary", event.currentTarget)} aria-label={`Abrir detalhes de ${user.displayName}`}>
              <span className={styles.avatar} aria-hidden="true">{user.displayName.slice(0, 2).toUpperCase()}</span>
              <span className={styles.identity}><strong>{user.displayName}</strong><small>{user.email}</small><em>{primary?.workspaceName || "Sem workspace"}</em></span>
            </button>
            <span className={styles.rowStats}><strong>{count(primary?.connected || 0)} <small>contas</small></strong><strong>{primary?.billingMode === "supplier" ? "APIs próprias" : money(primary?.walletBalanceCents || 0)} <small>OTP</small></strong></span>
            <span className={user.status === "active" ? styles.active : styles.inactive}>{user.status === "active" ? "Ativo" : "Inativo"}</span>
            <span className={styles.rowActions}><button type="button" onClick={(event) => openModal(user.id, "analysis", event.currentTarget)} aria-label={`Análise de ${user.displayName}`}>Análise</button><button type="button" onClick={(event) => openModal(user.id, "settings", event.currentTarget)} aria-label={`Gerenciar ${user.displayName}`}>Gerenciar</button></span>
          </div>;
        })}
        {!loading && !data?.users.length ? <p className={styles.empty}>Nenhum usuário encontrado para esta busca.</p> : null}
        <div className={styles.pagination}><button type="button" disabled={page <= 1 || loading} onClick={() => { setPage((value) => value - 1); setSelectedId(null); }}>Anterior</button><span>{page} / {pages}</span><button type="button" disabled={page >= pages || loading} onClick={() => { setPage((value) => value + 1); setSelectedId(null); }}>Próxima</button></div>
    </div>
    {current ? createPortal(<div className={styles.modalOverlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
      <div className={styles.detail} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="user-details-title" tabIndex={-1}>
        <header className={styles.modalHeader}><div className={styles.personHeading}><span className={styles.avatarLarge} aria-hidden="true">{current.displayName.slice(0, 2).toUpperCase()}</span><div><span className="panel-kicker">Conta de usuário</span><h2 id="user-details-title">{current.displayName}</h2><p>{current.email}</p></div></div><button type="button" className={styles.closeButton} onClick={closeModal} aria-label={`Fechar detalhes de ${current.displayName}`}>Fechar <span aria-hidden="true">×</span></button></header>
        <div ref={tabsRef} className={styles.tabs} role="tablist" aria-label="Seções do usuário" tabIndex={-1} onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const index = sections.findIndex((item) => item.id === section);
          const next = event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + sections.length) % sections.length;
          setSection(sections[next].id);
          window.requestAnimationFrame(() => tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus());
        }}>{sections.map((item) => <button type="button" key={item.id} role="tab" id={`user-tab-${item.id}`} aria-selected={section === item.id} aria-controls="user-detail-panel" tabIndex={section === item.id ? 0 : -1} onClick={() => setSection(item.id)}>{item.label}</button>)}</div>
        <div className={styles.modalBody} id="user-detail-panel" role="tabpanel" aria-labelledby={`user-tab-${section}`} tabIndex={0}>
        {section === "summary" ? <>
          <div className={styles.profileFacts}><span><small>Acesso</small><strong>{current.isPlatformAdmin ? "Superadmin" : current.status === "active" ? "Ativo" : "Inativo"}</strong></span><span><small>Último login</small><strong>{date(current.lastLoginAt)}</strong></span><span><small>Criado em</small><strong>{date(current.createdAt)}</strong></span></div>
          </> : null}
        {section === "settings" ? <div className={styles.profileFacts}><span><small>Conta</small><strong>{current.status === "active" ? "Ativa" : "Inativa"}</strong></span><span><small>Papel</small><strong>{current.isPlatformAdmin ? "Superadmin" : "Usuário"}</strong></span><span><small>Senha temporária</small><strong>{current.mustChangePassword ? "Troca exigida no login" : "Troca não pendente"}</strong></span></div> : null}
        {section === "analysis" ? <div className={styles.actions}><button type="button" onClick={() => onOpenAnalysis(current.id)}>Abrir dashboard completo do usuário</button></div> : null}
          {section !== "otp" && memberships.length ? memberships.map((membership) => <section key={membership.workspaceOwnerUserId} className={styles.workspace}>
            <div className={styles.workspaceHeading}><div><span className="panel-kicker">Workspace · {membership.role}</span><h4>{membership.workspaceName}</h4></div><span className={membership.workspaceStatus === "active" ? styles.active : styles.inactive}>{membership.workspaceStatus === "active" ? "Ativo" : membership.workspaceStatus}</span></div>
            {section === "summary" || section === "analysis" ? <>
            <div className={styles.metrics}><div><small>Contas conectadas</small><strong>{count(membership.connected)}</strong><span>{count(membership.accounts)} no histórico</span></div><div><small>Views · {periodLabel}</small><strong>{count(membership.views)}</strong><span>{count(membership.reach)} de alcance</span></div><div><small>Posts · {periodLabel}</small><strong>{count(membership.published)}</strong><span>Publicados no período</span></div>{section === "summary" ? <div><small>Gmail OTP · {membership.billingMode === "supplier" ? "APIs próprias" : "Carteira e PIX"}</small><strong>{membership.billingMode === "supplier" ? `${membership.otpEnabledApisCount}/${membership.otpApisCount} APIs ativas` : money(membership.walletBalanceCents)}</strong><span>{membership.billingMode === "supplier" ? "Saldo externo no detalhe das APIs" : "Saldo da carteira interna"} · {membership.otpOpenOrders} e-mail(s) aberto(s)</span></div> : null}</div>
            </> : null}
            {section === "summary" || section === "meta" ? <>
            <div className={styles.integrationSummary}>
              <div><small>Apps Meta · {membership.metaAccessMode === "legacy" ? "legado" : "catálogo"}</small>
                <strong>{membership.metaApps.length ? `${membership.metaApps.length} disponível(is)` : "Nenhum atribuído"}</strong>
                <p>{membership.metaApps.map((app) => `${app.label} (${app.configured ? "configurado" : "indisponível"})`).join(" · ") || "Novas conexões por App do catálogo não estão liberadas."}</p></div>
              {section === "summary" ? <div><small>Gmail OTP · {current.status === "active" && membership.status === "active" ? "acesso ativo" : "acesso inativo"}</small>
                <strong>{membership.billingMode === "supplier" ? "APIs próprias" : "Carteira e PIX"}</strong>
                <p>{membership.billingMode === "supplier" ? `${membership.otpEnabledApisCount}/${membership.otpApisCount} APIs ativas; saldo externo no detalhe das APIs` : `Saldo da carteira interna ${money(membership.walletBalanceCents)}`} · {membership.otpOpenOrders} e-mails abertos</p></div> : null}
            </div>
            </> : null}
            {section === "settings" ? <div className={styles.profileFacts}><span><small>Papel</small><strong>{membership.role}</strong></span><span><small>Vínculo</small><strong>{membership.status}</strong></span><span><small>Workspace</small><strong>{membership.workspaceStatus}</strong></span></div> : null}
            {section === "summary" || section === "meta" ? <div className={styles.actions}><button type="button" onClick={() => { setOtpTarget({ accountUserId: current.id, workspaceOwnerUserId: membership.workspaceOwnerUserId, email: current.email, displayName: current.displayName, workspaceName: membership.workspaceName }); setSection("otp"); }}>Configurar Gmail OTP</button><button type="button" onClick={() => onOpenMetaApp(membership.workspaceOwnerUserId)}>Configurar App Meta</button></div> : null}
          </section>) : section !== "otp" ? <p className={styles.empty}>Este usuário ainda não está vinculado a um workspace.</p> : null}
          {section === "otp" ? <>
            {memberships.length > 1 ? <label className={styles.workspacePicker}>Workspace <select value={otpTarget?.workspaceOwnerUserId || memberships[0].workspaceOwnerUserId} onChange={(event) => { const membership = memberships.find((item) => item.workspaceOwnerUserId === event.target.value); if (membership) setOtpTarget({ accountUserId: current.id, workspaceOwnerUserId: membership.workspaceOwnerUserId, email: current.email, displayName: current.displayName, workspaceName: membership.workspaceName }); }}>{memberships.map((membership) => <option key={membership.workspaceOwnerUserId} value={membership.workspaceOwnerUserId}>{membership.workspaceName}</option>)}</select></label> : null}
            {memberships.length ? (() => { const membership = memberships.find((item) => item.workspaceOwnerUserId === otpTarget?.workspaceOwnerUserId) || memberships[0]; const target = { accountUserId: current.id, workspaceOwnerUserId: membership.workspaceOwnerUserId, email: current.email, displayName: current.displayName, workspaceName: membership.workspaceName }; return <AdminUserOtpManager key={`${target.accountUserId}:${target.workspaceOwnerUserId}`} target={target} onClose={() => setSection("summary")} />; })() : <p className={styles.empty}>Sem workspace para configurar Gmail OTP.</p>}
          </> : null}
        </div>
      </div>
    </div>, document.body) : null}
  </section>;
}
