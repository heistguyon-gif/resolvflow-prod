"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./MetaAppsManager.module.css";

type Target = { accountUserId: string; userName: string; userEmail: string; workspaceOwnerUserId: string; workspaceName: string };
type Assignment = Target & { id: string; metaAppId: string; userStatus: string; workspaceStatus: string };
type MetaApp = { id: string; label: string; appId: string; graphVersion: string; redirectUri: string;
  status: string; createdAt: string; updatedAt: string; assignments: Assignment[] };
type Payload = { apps: MetaApp[]; targets: Target[]; redirectUri: string; graphVersion: string; error?: string };

const maskAppId = (value: string) => value.length < 9 ? value : `${value.slice(0, 5)}•••${value.slice(-4)}`;
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
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar.");
      setLabel(""); setAppId(""); setAppSecret("");
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

  return <section className={styles.wrap}>
    <header className={styles.intro}><div><span className="panel-kicker">Catálogo compartilhável</span><h2>Cadastro e atribuições</h2>
      <p>Cadastre o App uma vez; conceda acesso por usuário e workspace. O secret fica cifrado e não retorna à tela.</p></div>
      <button type="button" className="outline-button" onClick={() => void load()} disabled={busy}>Atualizar</button></header>
    {initialWorkspaceOwnerUserId ? <p className={styles.context}>Workspace vindo do diretório: <strong>{targets.find((target) => target.workspaceOwnerUserId === initialWorkspaceOwnerUserId)?.workspaceName || initialWorkspaceOwnerUserId}</strong>. Selecione também o usuário em cada atribuição.</p> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    <div className={styles.grid}>
      <form className={styles.form} onSubmit={save}>
        <h3>Cadastrar App</h3><p>O mesmo registro pode atender vários usuários sem repetir credenciais.</p>
        <label>Nome do App<input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ex.: App principal" maxLength={100} required /></label>
        <label>Meta App ID<input value={appId} onChange={(event) => setAppId(event.target.value.replace(/\D/g, ""))} inputMode="numeric" autoComplete="off" required /></label>
        <label>Meta App Secret<input type="password" value={appSecret} onChange={(event) => setAppSecret(event.target.value)} autoComplete="new-password" required /></label>
        <div className={styles.fixed}><strong>Callback obrigatório</strong><code>{data?.redirectUri || "https://resolvflow.online/api/meta/callback"}</code>
          <small>Configure esta URL no painel da Meta antes de conectar perfis.</small></div>
        <button type="submit" className={styles.submit} disabled={busy || !data}>{busy ? "Salvando..." : "Cadastrar App"}</button>
      </form>
      <div className={styles.list}><div className={styles.listHeading}><div><h3>Apps cadastrados</h3><p>{data?.apps.length || 0} no catálogo · Graph {data?.graphVersion || "—"}</p></div></div>
        {!data ? <p className={styles.empty}>Carregando catálogo...</p> : data.apps.length ? data.apps.map((app) => <article key={app.id} className={styles.card}>
          <div className={styles.cardHead}><div><span className={app.status === "active" ? styles.active : styles.disabled}>{app.status === "active" ? "Configurado · ativo" : "Desativado"}</span>
            <h4>{app.label}</h4><small>ID {maskAppId(app.appId)} · {app.graphVersion}</small></div>
            <button type="button" className={styles.outline} disabled={busy} onClick={() => void mutate({ action: app.status === "active" ? "disable" : "activate", id: app.id }, app.status === "active" ? "App desativado para novas conexões." : "App ativado.")}>{app.status === "active" ? "Desativar" : "Ativar"}</button></div>
          <div className={styles.assignments}><strong>Atribuições ativas ({app.assignments.length})</strong>
            {app.assignments.length ? app.assignments.map((assignment) => <div key={assignment.id} className={styles.assignment}>
              <span><b>{assignment.userName}</b><small>{assignment.userEmail} · {assignment.workspaceName}</small></span>
              <button type="button" disabled={busy} onClick={() => void revoke(app, assignment)} aria-label={`Remover ${app.label} de ${assignment.userName} em ${assignment.workspaceName}`}>Remover</button></div>)
              : <p>Nenhum usuário atribuído. Este App não aparece para usuários comuns.</p>}</div>
          <div className={styles.assignForm}><label>Adicionar usuário e workspace<select value={targetByApp[app.id] || ""} onChange={(event) => setTargetByApp((current) => ({ ...current, [app.id]: event.target.value }))}>
            <option value="">Selecione pessoa e destino</option>{targets.map((target) => <option key={targetKey(target)} value={targetKey(target)}>{target.userName} ({target.userEmail}) — {target.workspaceName}</option>)}</select></label>
            <button type="button" disabled={busy || !targetByApp[app.id]} onClick={() => void assign(app)}>Atribuir</button></div>
          <p className={styles.assignmentNote}>A primeira atribuição passa esta pessoa e workspace ao catálogo. Apps legados deixam de aparecer para esse destino; conexões já existentes continuam operando.</p>
        </article>) : <div className={styles.empty}>Nenhum App no catálogo. Apps legados continuam disponíveis apenas para usuários ainda fora da gestão por atribuições.</div>}</div>
    </div>
  </section>;
}
