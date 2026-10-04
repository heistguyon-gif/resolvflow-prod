"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./MetaAppsManager.module.css";

type Workspace = { workspaceOwnerUserId: string; workspaceName: string; ownerEmail: string | null; ownerName: string | null };
type MetaApp = { id: string; workspaceOwnerUserId: string; label: string; appId: string; graphVersion: string; redirectUri: string; status: string; createdAt: string; updatedAt: string };
type Payload = { apps: MetaApp[]; workspaces: Workspace[]; redirectUri: string; graphVersion: string; error?: string };

const maskAppId = (value: string) => value.length < 9 ? value : `${value.slice(0, 5)}•••${value.slice(-4)}`;

export function MetaAppsManager({ initialWorkspaceOwnerUserId = "" }: { initialWorkspaceOwnerUserId?: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [workspaceOwnerUserId, setWorkspaceOwnerUserId] = useState(initialWorkspaceOwnerUserId);
  const [label, setLabel] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/meta-apps", { cache: "no-store" });
      const payload = await response.json() as Payload;
      if (!response.ok) throw new Error(payload.error || "Falha ao carregar os Apps Meta.");
      setData(payload);
      setWorkspaceOwnerUserId((current) => current || payload.workspaces[0]?.workspaceOwnerUserId || "");
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao carregar os Apps Meta."); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const workspace = useMemo(() => data?.workspaces.find((item) => item.workspaceOwnerUserId === workspaceOwnerUserId), [data?.workspaces, workspaceOwnerUserId]);

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/meta-apps", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceOwnerUserId, label, appId, appSecret }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar.");
      setAppSecret(""); setNotice("App salvo com segurança. O secret não será exibido novamente."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar."); } finally { setBusy(false); }
  }

  async function changeStatus(id: string, action: "activate" | "disable") {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/meta-apps", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar.");
      setNotice(action === "activate" ? "App ativado." : "App desativado para novas conexões."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível atualizar."); } finally { setBusy(false); }
  }

  return <section className={styles.wrap}>
    <div className={styles.intro}><div><span className="panel-kicker">Credenciais isoladas</span><h2>Apps Meta por workspace</h2><p>O secret é cifrado no D1 e nunca volta para a tela. Cada workspace enxerga apenas o seu App.</p></div><button type="button" className="outline-button" onClick={() => void load()} disabled={busy}>Atualizar</button></div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}{notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    <div className={styles.grid}>
      <form className={styles.form} onSubmit={save}>
        <h3>Adicionar ou substituir App</h3>
        <p>Ao salvar novamente para o mesmo workspace, o secret anterior é substituído e continua oculto.</p>
        <label>Workspace<select value={workspaceOwnerUserId} onChange={(event) => setWorkspaceOwnerUserId(event.target.value)} required>{data?.workspaces.map((item) => <option key={item.workspaceOwnerUserId} value={item.workspaceOwnerUserId}>{item.workspaceName} {item.ownerEmail ? `— ${item.ownerEmail}` : ""}</option>)}</select></label>
        <label>Nome do App<input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={workspace?.ownerName ? `App ${workspace.ownerName}` : "Ex.: App João"} maxLength={100} required /></label>
        <label>Meta App ID<input value={appId} onChange={(event) => setAppId(event.target.value.replace(/\D/g, ""))} inputMode="numeric" autoComplete="off" required /></label>
        <label>Meta App Secret<input type="password" value={appSecret} onChange={(event) => setAppSecret(event.target.value)} autoComplete="new-password" required /></label>
        <div className={styles.fixed}><strong>Callback obrigatório</strong><code>{data?.redirectUri || "https://resolvflow.online/api/meta/callback"}</code><small>Configure esta URL no painel da Meta antes de conectar perfis.</small></div>
        <button type="submit" className="primary-button" disabled={busy || !data}>{busy ? "Salvando..." : "Salvar App Meta"}</button>
      </form>
      <div className={styles.list}><div className={styles.listHeading}><div><h3>Apps cadastrados</h3><p>{data?.apps.length || 0} isolado(s) por workspace</p></div><span>Graph {data?.graphVersion || "—"}</span></div>{data?.apps.length ? data.apps.map((app) => { const owner = data.workspaces.find((item) => item.workspaceOwnerUserId === app.workspaceOwnerUserId); return <article key={app.id} className={styles.card}><div><span className={app.status === "active" ? styles.active : styles.disabled}>{app.status === "active" ? "Ativo" : "Desativado"}</span><h4>{app.label}</h4><p>{owner?.workspaceName || "Workspace removido"}{owner?.ownerEmail ? ` — ${owner.ownerEmail}` : ""}</p><small>ID {maskAppId(app.appId)} · {app.graphVersion}</small></div><button type="button" className="outline-button" onClick={() => void changeStatus(app.id, app.status === "active" ? "disable" : "activate")} disabled={busy}>{app.status === "active" ? "Desativar" : "Ativar"}</button></article>; }) : <div className={styles.empty}>Nenhum App por workspace foi cadastrado ainda. Apps antigos da plataforma continuam funcionando normalmente.</div>}</div>
    </div>
  </section>;
}
