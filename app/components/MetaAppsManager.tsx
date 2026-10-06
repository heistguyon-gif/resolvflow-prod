"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatAdminDateTime } from "../lib/adminDateTime";
import { filterAndSortMetaApps } from "../lib/metaAppCatalog";
import styles from "./MetaAppsManager.module.css";

type Target = { accountUserId: string; userName: string; userEmail: string; workspaceOwnerUserId: string; workspaceName: string };
type Assignment = Target & { id: string; metaAppId: string; userStatus: string; workspaceStatus: string };
type MetaApp = { id: string; label: string; appId: string; graphVersion: string; redirectUri: string;
  status: string; createdAt: string; updatedAt: string; assignments: Assignment[] };
type Payload = { apps: MetaApp[]; targets: Target[]; redirectUri: string; graphVersion: string; error?: string };

const targetKey = (target: Target) => `${target.accountUserId}\u001f${target.workspaceOwnerUserId}`;

export function MetaAppsManager({ initialWorkspaceOwnerUserId = "" }: { initialWorkspaceOwnerUserId?: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [label, setLabel] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [targetByApp, setTargetByApp] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/meta-apps", { cache: "no-store" });
      const payload = await response.json() as Payload;
      if (!response.ok) throw new Error(payload.error || "Falha ao carregar os Apps Meta.");
      setData(payload); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao carregar os Apps Meta."); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const targets = useMemo(() => [...(data?.targets || [])].sort((a, b) =>
    Number(b.workspaceOwnerUserId === initialWorkspaceOwnerUserId) - Number(a.workspaceOwnerUserId === initialWorkspaceOwnerUserId)
    || a.userName.localeCompare(b.userName) || a.workspaceName.localeCompare(b.workspaceName)), [data?.targets, initialWorkspaceOwnerUserId]);
  const apps = data?.apps || [];
  const visibleApps = filterAndSortMetaApps(apps, search, status);

  async function mutate(body: Record<string, string>, message: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/meta-apps", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível atualizar o App.");
      setNotice(message); await load();
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível atualizar o App."); return false; }
    finally { setBusy(false); }
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/meta-apps", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label, appId, appSecret }) });
      const result = await response.json() as { id?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar.");
      setLabel(""); setAppId(""); setAppSecret("");
      setShowCreate(false); setSearch(""); setStatus("all"); setExpandedId(result.id || null);
      setNotice("App cadastrado. Escolha explicitamente os usuários e workspaces que poderão iniciar novas conexões.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }

  async function assign(app: MetaApp) {
    const selected = targets.find((target) => targetKey(target) === targetByApp[app.id]);
    if (!selected) return;
    if (await mutate({ action: "assign", id: app.id, accountUserId: selected.accountUserId,
      workspaceOwnerUserId: selected.workspaceOwnerUserId },
    `${app.label} atribuído a ${selected.userName} em ${selected.workspaceName}.`)) {
      setTargetByApp((current) => ({ ...current, [app.id]: "" }));
    }
  }

  async function revoke(app: MetaApp, assignment: Assignment) {
    if (!window.confirm(`Remover ${app.label} de ${assignment.userName} em ${assignment.workspaceName}?\n\nNovas conexões por este App serão bloqueadas para essa pessoa neste workspace. Conexões Meta existentes continuarão operando.`)) return;
    await mutate({ action: "revoke", assignmentId: assignment.id },
      `Atribuição removida de ${assignment.userName} em ${assignment.workspaceName}.`);
  }

  return <section className={styles.wrap} aria-label="Apps Meta da plataforma">
    <header className={styles.intro}><div><span className="panel-kicker">Catálogo compartilhável</span><h2>Apps Meta</h2>
      <p>Cada registro tem credenciais e atribuições próprias, mesmo quando o Meta App ID se repete.</p></div>
      <div className={styles.topActions}><button type="button" className={styles.outline} onClick={() => void load()} disabled={busy}>Atualizar</button>
        <button ref={createButtonRef} type="button" className={styles.submit} onClick={() => setShowCreate((current) => !current)} aria-expanded={showCreate}>{showCreate ? "Fechar cadastro" : "Cadastrar App"}</button></div></header>
    {initialWorkspaceOwnerUserId ? <p className={styles.context}>Workspace vindo do diretório: <strong>{targets.find((target) => target.workspaceOwnerUserId === initialWorkspaceOwnerUserId)?.workspaceName || initialWorkspaceOwnerUserId}</strong>. Selecione também o usuário em cada atribuição.</p> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    {showCreate ? <form id="meta-app-create" className={styles.form} onSubmit={save}>
      <div><h3>Novo registro de App</h3><p>O mesmo App ID pode ter registros separados. Cada um mantém secret, status e atribuições próprios.</p></div>
      <div className={styles.formFields}><label>Nome do App<input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ex.: App principal" maxLength={100} required /></label>
        <label>Meta App ID<input value={appId} onChange={(event) => setAppId(event.target.value.replace(/\D/g, ""))} inputMode="numeric" pattern="[0-9]{5,40}" autoComplete="off" required /></label>
        <label>Meta App Secret<input type="password" value={appSecret} onChange={(event) => setAppSecret(event.target.value)} autoComplete="new-password" minLength={12} maxLength={512} required /></label></div>
      <div className={styles.fixed}><strong>Callback obrigatório</strong><code>{data?.redirectUri || "https://resolvflow.online/api/meta/callback"}</code><small>Configure esta URL no painel da Meta antes de conectar perfis.</small></div>
      <div className={styles.formActions}><button type="button" className={styles.outline} onClick={() => { setShowCreate(false); createButtonRef.current?.focus(); }}>Cancelar</button><button type="submit" className={styles.submit} disabled={busy || !data}>{busy ? "Salvando..." : "Salvar App"}</button></div>
    </form> : null}
    <div className={styles.list}>
      <div className={styles.listHeading}><div><h3>Apps cadastrados</h3><p>{visibleApps.length} de {apps.length} registros · mais recentes primeiro</p></div>
        <div className={styles.filters}><label>Buscar por nome ou App ID<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar App" /></label>
          <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos</option><option value="active">Ativos</option><option value="disabled">Desativados</option></select></label></div></div>
      <div className={styles.columnHead} aria-hidden="true"><span>App e registro</span><span>Meta App ID</span><span>Status</span><span>Atribuições</span><span>Criado</span><span>Ação</span></div>
      {!data ? <p className={styles.empty}>Carregando catálogo...</p> : visibleApps.length ? visibleApps.map((app) => <article key={app.id} className={styles.card}>
        <div className={styles.appRow}><span className={styles.identity}><strong>{app.label}</strong><small title={app.id}>Registro {app.id}</small></span>
          <code className={styles.appId}>{app.appId}</code><span className={app.status === "active" ? styles.active : styles.disabled}>{app.status === "active" ? "Ativo" : "Desativado"}</span>
          <span className={styles.assignmentCount}>{app.assignments.length} usuário(s)</span><time dateTime={app.createdAt}>{formatAdminDateTime(app.createdAt)}</time>
          <button type="button" className={styles.outline} aria-expanded={expandedId === app.id} aria-label={`${expandedId === app.id ? "Fechar detalhes" : "Detalhes"} de ${app.label}, registro ${app.id}`} onClick={() => setExpandedId((current) => current === app.id ? null : app.id)}>{expandedId === app.id ? "Fechar" : "Detalhes"}</button></div>
        {expandedId === app.id ? <div id={`meta-app-detail-${app.id}`} className={styles.details}>
          <div className={styles.detailMeta}><span><small>Registro interno</small><code>{app.id}</code></span><span><small>Graph</small><strong>{app.graphVersion}</strong></span><span><small>Atualizado</small><strong>{formatAdminDateTime(app.updatedAt)}</strong></span><span><small>Callback</small><code>{app.redirectUri}</code></span></div>
          <div className={styles.detailActions}><button type="button" className={styles.outline} disabled={busy} aria-label={`${app.status === "active" ? "Desativar" : "Ativar"} ${app.label}, registro ${app.id}`} onClick={() => void mutate({ action: app.status === "active" ? "disable" : "activate", id: app.id }, app.status === "active" ? "App desativado para novas conexões." : "App ativado.")}>{app.status === "active" ? "Desativar este registro" : "Ativar este registro"}</button></div>
          <div className={styles.assignments}><strong>Atribuições ativas ({app.assignments.length})</strong>
            {app.assignments.length ? app.assignments.map((assignment) => <div key={assignment.id} className={styles.assignment}><span><b>{assignment.userName}</b><small>{assignment.userEmail} · {assignment.workspaceName}</small></span><button type="button" disabled={busy} onClick={() => void revoke(app, assignment)} aria-label={`Remover registro ${app.id} de ${assignment.userName} em ${assignment.workspaceName}`}>Remover</button></div>)
              : <p>Nenhum usuário atribuído. Este registro não aparece para usuários comuns.</p>}</div>
          <div className={styles.assignForm}><label>Adicionar usuário e workspace<select value={targetByApp[app.id] || ""} onChange={(event) => setTargetByApp((current) => ({ ...current, [app.id]: event.target.value }))}><option value="">Selecione pessoa e destino</option>{targets.map((target) => <option key={targetKey(target)} value={targetKey(target)}>{target.userName} ({target.userEmail}) — {target.workspaceName}</option>)}</select></label><button type="button" disabled={busy || !targetByApp[app.id]} onClick={() => void assign(app)}>Atribuir</button></div>
          <p className={styles.assignmentNote}>A primeira atribuição passa esta pessoa e workspace ao catálogo. Apps legados deixam de aparecer para esse destino; conexões já existentes continuam operando.</p>
        </div> : null}
      </article>) : <p className={styles.empty}>{apps.length ? "Nenhum App corresponde à busca ou ao status." : "Nenhum App no catálogo. Apps legados continuam disponíveis apenas para usuários ainda fora da gestão por atribuições."}</p>}
    </div>
  </section>;
}
