"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeInstagramInviteUsername } from "../../lib/meta-invite-username";
import styles from "./ConnectQueue.module.css";
import { inviteFailurePresentation } from "../lib/invitePresentation";
import { authorizedAppKey, failedConnectionApps, pendingConnectionApps, resolvedConnectionApps } from "../lib/connectionAppState";
import { createCampaignReadGuard } from "../lib/campaignReadGuard";
import { META_APPS_CHANGED_EVENT } from "./MetaAppsPanel";

type MetaAppChoice = "default" | "operation_2" | "operation_3" | "leandro" | "wgb" | "wgb02" | "prado" | "fabricio" | "teste" | (string & {});
type QueueItem = {
  id: string;
  username: string;
  metaAppKey: MetaAppChoice;
  metaAppLabel: string;
  status: string;
  inviteMode: string;
  inviteLastError: string | null;
  requestedByEmail: string;
  invitedAt: string | null;
  createdAt: string;
};

async function api<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, { credentials: "same-origin", ...init });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar a fila.");
  return payload;
}

function InviteStatus({ item }: { item: QueueItem }) {
  const presentation = item.status === "failed" ? inviteFailurePresentation(item.inviteLastError)
    : item.status === "invited" ? { label: "Convite enviado", detail: "Aceite no Instagram para conectar o perfil.", tone: "connected" }
    : item.status === "processing" ? { label: "Enviando convite", detail: "O bot está processando este perfil.", tone: "processing" }
    : { label: "Aguardando bot", detail: "Pedido na fila de envio.", tone: "pending" };
  return <div className="invite-status"><span className={`queue-status ${presentation.tone}`}>{presentation.label}</span><p>{presentation.detail}</p></div>;
}

type ConnectQueueProps = { canOperate: boolean; readabilityPreview?: boolean; contextKey: string };

// Remount all selections and pending operations when the authenticated context changes.
export function ConnectQueue(props: ConnectQueueProps) {
  return <ConnectQueueSession key={props.contextKey} {...props} />;
}

function ConnectQueueSession({ canOperate, readabilityPreview = false, contextKey }: ConnectQueueProps) {
  const [app, setApp] = useState<MetaAppChoice>("");
  const [appsState, setAppsState] = useState(pendingConnectionApps);
  const appChoices = appsState.apps;
  const botApps = appsState.botApps;
  const reads = useRef(createCampaignReadGuard());
  const mounted = useRef(false);
  const [inviteUrl, setInviteUrl] = useState("https://www.instagram.com/accounts/manage_access/");
  const [isAdmin, setIsAdmin] = useState(false);
  const [canDirectConnect, setCanDirectConnect] = useState(false);
  const [canBotInvite, setCanBotInvite] = useState(false);
  const [botUsernames, setBotUsernames] = useState(["", "", ""]);
  const [botApp, setBotApp] = useState("");
  const [botComposerOpen, setBotComposerOpen] = useState(false);
  const [mine, setMine] = useState<QueueItem[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);

  const load = useCallback(async () => {
    if (!contextKey || !mounted.current) return;
    const request = reads.current.begin(contextKey);
    setAppsState(pendingConnectionApps());
    setIsAdmin(false); setCanDirectConnect(false); setCanBotInvite(false);
    setMine([]); setQueue([]);
    try {
      const data = await api<{ isPlatformAdmin?: boolean; canDirectConnect?: boolean; canBotInvite?: boolean; botApps?: Array<{ key: string; label: string }>; inviteUrl?: string; apps?: Array<{ key: MetaAppChoice; label: string }>; mine?: QueueItem[]; queue?: QueueItem[] }>("/api/meta/connect-queue", { signal: request.signal });
      if (!request.current() || !mounted.current) return;
      const resolved = resolvedConnectionApps(data);
      setAppsState(resolved);
      setApp((current) => authorizedAppKey(resolved.apps, current));
      setBotApp((current) => authorizedAppKey(resolved.botApps, current));
      setIsAdmin(Boolean(data.isPlatformAdmin));
      setCanDirectConnect(Boolean(data.canDirectConnect));
      setCanBotInvite(Boolean(data.canBotInvite));
      if (data.inviteUrl) setInviteUrl(data.inviteUrl);
      setMine(data.mine || []); setQueue(data.queue || []);
    } catch (err) {
      if (!request.current() || !mounted.current) return;
      setAppsState(failedConnectionApps(err)); setApp(""); setBotApp("");
      throw err;
    }
  }, [contextKey]);

  useEffect(() => {
    mounted.current = true;
    const guard = reads.current;
    guard.setWorkspace(contextKey);
    queueMicrotask(() => void load().catch(() => {}));
    // Registering/disabling an app in the "Apps Meta" panel refreshes the connectable list.
    const refresh = () => void load().catch(() => {});
    window.addEventListener(META_APPS_CHANGED_EVENT, refresh);
    return () => { mounted.current = false; guard.cancel(); window.removeEventListener(META_APPS_CHANGED_EVENT, refresh); };
  }, [load, contextKey]);

  const ready = Boolean(contextKey) && appsState.status === "ready";
  const canConnect = ready && canOperate && appChoices.some((choice) => choice.key === app);
  const canInvite = ready && canOperate && canBotInvite && botApps.some((choice) => choice.key === botApp);

  const pendingByUser = useMemo(() => {
    const groups = new Map<string, QueueItem[]>();
    for (const item of queue.filter((row) => row.status === "pending" || (row.inviteMode === "automatic" && (row.status === "processing" || row.status === "failed")))) {
      const key = item.requestedByEmail || "sem e-mail";
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [queue]);

  function updateBotUsername(index: number, value: string) {
    setBotUsernames((current) => {
      const next = current.map((username, position) => position === index ? value : username);
      if (index === next.length - 1 && value.trim() && next.length < 50) next.push("");
      return next;
    });
  }

  async function requestBotInvite() {
    if (busy || !canInvite || !mounted.current) return;
    const filled = botUsernames.map((value, index) => ({ value: value.trim(), index })).filter(({ value }) => value);
    if (!filled.length) { setError(true); setMessage("Informe pelo menos um usuário do Instagram, com ou sem @."); return; }
    const invalid = filled.find(({ value }) => !normalizeInstagramInviteUsername(value));
    if (invalid) { setError(true); setMessage(`Confira o usuário no campo ${invalid.index + 1}. Informe um perfil por campo, com ou sem @.`); return; }
    const usernames = [...new Set(filled.map(({ value }) => normalizeInstagramInviteUsername(value)!))];
    setBusy(true); setError(false); setMessage("");
    try {
      const failed: Array<{ username: string; message: string }> = [];
      let created = 0;
      for (const username of usernames) {
        if (!mounted.current) return;
        try {
          await api("/api/meta/connect-queue", { method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ usernames: `@${username}`, metaAppKey: botApp || undefined, inviteMode: "automatic" }) });
          created += 1;
        } catch (reason) {
          failed.push({ username, message: reason instanceof Error ? reason.message : "Não foi possível registrar o pedido." });
        }
      }
      if (!mounted.current) return;
      setBotUsernames(failed.length ? failed.map(({ username }) => username) : ["", "", ""]);
      setBotComposerOpen(failed.length > 0);
      setError(failed.length > 0);
      const confirmation = created ? `${created} pedido(s) registrado(s). Aguardando bot.` : "Nenhum novo pedido registrado.";
      setMessage([confirmation, ...failed.map(({ username, message }) => `@${username}: ${message}`)].join(" "));
      try { await load(); }
      catch { setError(true); setMessage((current) => `${current} Não foi possível atualizar a lista. Recarregue a página para conferir os pedidos.`); }
    }
    finally { if (mounted.current) setBusy(false); }
  }

  function openComposer() {
    if (!canConnect || busy) return;
    setError(false);
    setMessage("");
    setComposerOpen(true);
  }

  function closeComposer() {
    setComposerOpen(false);
  }

  async function markInvited(ids: string[], email?: string) {
    if (!ready || !canOperate || !isAdmin || busy || !mounted.current) return;
    setBusy(true); setError(false); setMessage("");
    try {
      const result = await api<{ updated?: number }>("/api/meta/connect-queue", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(email ? { action: "invite_user", email } : { action: "invite", ids }),
      });
      if (!mounted.current) return;
      setMessage(`${result.updated || 0} perfil(is) liberados para aceitar o convite.`);
      await load();
    } catch (err) {
      if (!mounted.current) return;
      setError(true);
      setMessage(err instanceof Error ? err.message : "Não foi possível liberar o convite.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function cancelItems(ids: string[]) {
    if (!ids.length || !canOperate || !ready || busy || !mounted.current) return;
    setBusy(true); setError(false); setMessage("");
    try {
      await api("/api/meta/connect-queue", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel", ids }),
      });
      if (!mounted.current) return;
      setMine((current) => current.filter((item) => !ids.includes(item.id)));
      setQueue((current) => current.filter((item) => !ids.includes(item.id)));
      setMessage("Perfil removido da fila.");
      await load();
    } catch (err) {
      if (!mounted.current) return;
      setError(true);
      setMessage(err instanceof Error ? err.message : "Não foi possível remover o perfil.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  function startConnect(appKey: MetaAppChoice) {
    if (!ready || !canOperate || busy || !mounted.current || !appChoices.some((choice) => choice.key === appKey)) return;
    window.location.replace(`/api/meta/connect?app=${encodeURIComponent(appKey)}`);
  }

  async function copyUser(email: string, rows: QueueItem[]) {
    const lines = rows.map((item) => item.username).join("\n");
    if (!lines) return;
    await navigator.clipboard.writeText(lines);
    setCopied(email);
    window.setTimeout(() => setCopied(""), 1600);
  }

  const selectedApp = appChoices.find((item) => item.key === app)?.label || "App Meta";

  return (
    <section className="panel connect-queue">
      <div className="connect-queue-bar">
        <div>
          <span className="panel-kicker">Conexão Instagram</span>
          <h2>Conectar contas</h2>
        </div>
        <div className="connect-queue-actions">{canBotInvite ? <button type="button" className="outline-button" disabled={!canInvite || busy} onClick={() => { setMessage(""); setBotComposerOpen(true); }}>Convidar com o bot</button> : null}<button type="button" className="primary-button" disabled={!canConnect || busy} onClick={openComposer}>
          {canOperate ? "Conectar contas" : "Somente leitura"}
        </button></div>
      </div>
      {appsState.status === "loading" ? <p className="connect-queue-msg" role="status">Carregando apps autorizados…</p> : null}
      {appsState.status === "error" ? <p className="connect-queue-msg error" role="alert">{appsState.error} <button type="button" className="text-button" disabled={busy} onClick={() => void load().catch(() => {})}>Tentar novamente</button></p> : null}
      {ready && !appChoices.length ? <p className="connect-queue-msg" role="status">Nenhum app Meta cadastrado ainda. Para conectar perfis, cadastre o seu próprio app em <a href="#apps-meta">Apps Meta</a>; depois ele aparece aqui.</p> : null}
      {message && !composerOpen ? <p className={`connect-queue-msg ${error ? "error" : ""}`}>{message}</p> : null}

      {mine.length ? (
        <div className="connect-queue-list">
          {mine.map((item) => (
            <article key={item.id} className={`connect-queue-row ${item.status}`}>
              <strong>@{item.username}</strong>
              <small>{item.metaAppLabel}</small>
              {readabilityPreview && item.inviteMode === "automatic" ? <InviteStatus item={item} /> : null}
              {!readabilityPreview && item.inviteMode === "automatic" && (item.status === "pending" || item.status === "processing") ? <span className="queue-status pending">Aguardando bot</span> : null}
              {!readabilityPreview && item.inviteMode === "automatic" && item.status === "failed" ? <span className="queue-status pending">Falha do bot{item.inviteLastError ? ` · ${item.inviteLastError}` : ""}</span> : null}
              {item.inviteMode !== "automatic" && item.status === "pending" && !canDirectConnect ? <span className="queue-status pending">Aguardando liberação</span> : null}
              <span className="connect-queue-actions">
                {item.status === "invited" || (item.inviteMode !== "automatic" && item.status === "pending" && canDirectConnect) ? (
                  <>
                    <a className="outline-button" href={inviteUrl} target="_blank" rel="noreferrer">Aceitar no Instagram</a>
                    <button type="button" className="primary-button" disabled={busy || !ready || !canOperate || !appChoices.some((choice) => choice.key === item.metaAppKey)} onClick={() => startConnect(item.metaAppKey)}>Conectar</button>
                  </>
                ) : null}
                <button type="button" className="text-button" disabled={busy || !canInvite} onClick={() => void cancelItems([item.id])}>Remover</button>
              </span>
            </article>
          ))}
        </div>
      ) : null}

      {isAdmin ? (
        <div className="connect-queue-admin">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">Operação</span>
              <h2>Pendentes de todos os usuários</h2>
            </div>
            <span className="date-pill">{queue.filter((item) => item.status === "pending" && item.inviteMode !== "automatic").length} para liberar</span>
          </div>
          {pendingByUser.length ? pendingByUser.map(([email, rows]) => (
            <div key={email} className="connect-queue-app-block">
              <header>
                <strong>{email}</strong>
                <small>{rows.length} pendente(s)</small>
                <button type="button" className="text-button" onClick={() => void copyUser(email, rows)}>{copied === email ? "Copiado" : "Copiar @"}</button>
                {rows.some((item) => item.inviteMode !== "automatic" && item.status === "pending") ? <button type="button" className="outline-button" disabled={busy} onClick={() => void markInvited(rows.filter((item) => item.inviteMode !== "automatic" && item.status === "pending").map((item) => item.id), email)}>Liberar</button> : null}
              </header>
              {rows.map((item) => (
                <article key={item.id} className="connect-queue-row pending">
                  <strong>@{item.username}</strong>
                  <small>{item.metaAppLabel}</small>
                  {readabilityPreview && item.inviteMode === "automatic" ? <InviteStatus item={item} /> : null}
                  {!readabilityPreview && item.inviteMode === "automatic" ? <span className="queue-status pending">{item.status === "failed" ? `Falha do bot${item.inviteLastError ? ` · ${item.inviteLastError}` : ""}` : "Aguardando bot"}</span> : null}
                  <button type="button" className="text-button" disabled={busy} onClick={() => void cancelItems([item.id])}>Remover</button>
                </article>
              ))}
            </div>
          )) : <p className="connect-queue-empty">Nenhum perfil pendente nas outras contas.</p>}
        </div>
      ) : null}

      {botComposerOpen ? <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) setBotComposerOpen(false); }}>
        <div className={`import-modal connect-queue-modal ${styles.modal}`} role="dialog" aria-modal="true" aria-labelledby="bot-invite-title">
          <button type="button" className="modal-close" disabled={busy} onClick={() => setBotComposerOpen(false)} aria-label="Fechar">×</button>
          <span className={styles.icon} aria-hidden="true">@</span>
          <h2 id="bot-invite-title">Adicionar perfis do Instagram</h2>
          <p id="bot-invite-help">Informe os usuários, um por campo, com ou sem @. O bot solicita os convites no App Meta selecionado, um de cada vez. Cada perfil precisa aceitar o convite antes de conectar.</p>
          {botApps.length <= 1 ? <p className={styles.appLabel}>App: <strong>{botApps.find((choice) => choice.key === botApp)?.label || "App Meta atribuído"}</strong></p> : null}
          <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void requestBotInvite(); }}>
            {botApps.length > 1 ? <label className={styles.appChoice}>App Meta atribuído<select value={botApp} disabled={busy || !canInvite} onChange={(event) => setBotApp(event.target.value)}>{botApps.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}</select></label> : null}
            <div className={styles.users}>
              {botUsernames.map((username, index) => <div key={index} className={styles.userRow}>
                <label htmlFor={`bot-invite-username-${index}`}>Perfil {index + 1}</label>
                <div className={styles.inputWrap}><span className={styles.prefix} aria-hidden="true">@</span><input id={`bot-invite-username-${index}`} value={username} disabled={busy || !canInvite} aria-describedby="bot-invite-help" onChange={(event) => updateBotUsername(index, event.target.value)} placeholder="usuario.do.insta" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></div>
                {botUsernames.length > 3 ? <button type="button" className="text-button" aria-label={`Remover perfil ${index + 1}`} disabled={busy || !canInvite} onClick={() => setBotUsernames((current) => current.filter((_, position) => position !== index))}>Remover</button> : null}
              </div>)}
            </div>
            <button type="button" className={`text-button ${styles.addProfile}`} disabled={busy || !canInvite || botUsernames.length >= 50} onClick={() => setBotUsernames((current) => [...current, ""])}>+ Adicionar outro perfil</button>
            {message ? <p role={error ? "alert" : "status"}>{message}</p> : null}
            <div className={styles.actions}>
              <button type="button" className="outline-button" disabled={busy} onClick={() => setBotComposerOpen(false)}>Cancelar</button>
              <button type="submit" className="primary-button" disabled={busy || !canInvite || !botUsernames.some((username) => username.trim())}>{busy ? "Registrando pedidos…" : "Solicitar convites"}</button>
            </div>
          </form>
        </div>
      </div> : null}

      {composerOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeComposer()}>
          <div className="import-modal connect-queue-modal" role="dialog" aria-modal="true" aria-labelledby="connect-direct-title">
            <button type="button" className="modal-close" onClick={closeComposer} aria-label="Fechar">×</button>
            <span className="modal-icon">@</span>
            <h2 id="connect-direct-title">{appChoices.length > 1 ? "Escolha o app" : "Conectar perfil"}</h2>
            <p>{appChoices.length > 1 ? "Selecione o app Meta que será usado. Em seguida, você autoriza diretamente o perfil do Instagram que estiver aberto neste navegador." : `Você será direcionado para autorizar o perfil do Instagram usando ${selectedApp}.`}</p>
            {appChoices.length > 1 ? (
              <div className="connect-queue-apps" role="group" aria-label="App Meta para conectar">
                {appChoices.map((choice) => (
                  <button key={choice.key} type="button" className={app === choice.key ? "active" : ""} aria-pressed={app === choice.key} onClick={() => setApp(choice.key)} disabled={busy || !canConnect}>{choice.label}</button>
                ))}
              </div>
            ) : null}
            <button type="button" className="primary-button" disabled={!canConnect || busy} onClick={() => startConnect(app)}>Conectar com {selectedApp}</button>
          </div>
        </div>
      ) : null}

    </section>
  );
}
