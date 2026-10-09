"use client";

import { useEffect, useMemo, useState } from "react";

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

const DEFAULT_APP_CHOICES: Array<{ key: MetaAppChoice; label: string }> = [
  { key: "operation_3", label: "MK 1" },
  { key: "operation_2", label: "MK 2" },
  { key: "default", label: "MK 3" },
];

async function api<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, { credentials: "same-origin", ...init });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar a fila.");
  return payload;
}

export function ConnectQueue({ canOperate }: { canOperate: boolean }) {
  const [app, setApp] = useState<MetaAppChoice>("operation_3");
  const [appChoices, setAppChoices] = useState(DEFAULT_APP_CHOICES);
  const [inviteUrl, setInviteUrl] = useState("https://www.instagram.com/accounts/manage_access/");
  const [isAdmin, setIsAdmin] = useState(false);
  const [canDirectConnect, setCanDirectConnect] = useState(false);
  const [canBotInvite, setCanBotInvite] = useState(false);
  const [botUsername, setBotUsername] = useState("");
  const [botApp, setBotApp] = useState("");
  const [botApps, setBotApps] = useState<Array<{ key: string; label: string }>>([]);
  const [botComposerOpen, setBotComposerOpen] = useState(false);
  const [mine, setMine] = useState<QueueItem[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);

  async function load() {
    const data = await api<{ isPlatformAdmin?: boolean; canDirectConnect?: boolean; canBotInvite?: boolean; botApps?: Array<{ key: string; label: string }>; inviteUrl?: string; apps?: Array<{ key: MetaAppChoice; label: string }>; mine?: QueueItem[]; queue?: QueueItem[] }>("/api/meta/connect-queue");
    setIsAdmin(Boolean(data.isPlatformAdmin));
    setCanDirectConnect(Boolean(data.canDirectConnect));
    setCanBotInvite(Boolean(data.canBotInvite));
    setBotApps(data.botApps || []);
    setBotApp((current) => data.botApps?.some((choice) => choice.key === current) ? current : data.botApps?.[0]?.key || "");
    if (data.inviteUrl) setInviteUrl(data.inviteUrl);
    if (data.apps?.length) {
      setAppChoices(data.apps);
      setApp((current) => data.apps?.some((choice) => choice.key === current) ? current : data.apps![0].key);
    }
    setMine(data.mine || []);
    setQueue(data.queue || []);
  }

  useEffect(() => {
    queueMicrotask(() => void load().catch((err) => { setError(true); setMessage(err instanceof Error ? err.message : "Falha ao ler a fila."); }));
  }, []);

  const pendingByUser = useMemo(() => {
    const groups = new Map<string, QueueItem[]>();
    for (const item of queue.filter((row) => row.status === "pending" || (row.inviteMode === "automatic" && (row.status === "processing" || row.status === "failed")))) {
      const key = row.requestedByEmail || "sem e-mail";
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [queue]);

  async function requestBotInvite() {
    if (!/^@[a-zA-Z0-9._]{1,30}$/.test(botUsername.trim())) { setError(true); setMessage("Informe somente um @ do Instagram válido."); return; }
    setBusy(true); setError(false); setMessage("");
    try {
      await api("/api/meta/connect-queue", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ usernames: botUsername.trim(), metaAppKey: botApp || undefined, inviteMode: "automatic" }) });
      setBotComposerOpen(false); setBotUsername(""); setMessage("Pedido registrado. Aguardando bot.");
      await load();
    } catch (reason) { setError(true); setMessage(reason instanceof Error ? reason.message : "Não foi possível convidar."); }
    finally { setBusy(false); }
  }

  function openComposer() {
    if (!canOperate) return;
    setError(false);
    setMessage("");
    setComposerOpen(true);
  }

  function closeComposer() {
    setComposerOpen(false);
  }

  async function markInvited(ids: string[], email?: string) {
    setBusy(true); setError(false); setMessage("");
    try {
      const result = await api<{ updated?: number }>("/api/meta/connect-queue", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(email ? { action: "invite_user", email } : { action: "invite", ids }),
      });
      setMessage(`${result.updated || 0} perfil(is) liberados para aceitar o convite.`);
      await load();
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : "Não foi possível liberar o convite.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelItems(ids: string[]) {
    if (!ids.length || !canOperate) return;
    setBusy(true); setError(false); setMessage("");
    try {
      await api("/api/meta/connect-queue", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel", ids }),
      });
      setMine((current) => current.filter((item) => !ids.includes(item.id)));
      setQueue((current) => current.filter((item) => !ids.includes(item.id)));
      setMessage("Perfil removido da fila.");
      await load();
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : "Não foi possível remover o perfil.");
    } finally {
      setBusy(false);
    }
  }

  function startConnect(appKey: MetaAppChoice) {
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
        <div className="connect-queue-actions">{canBotInvite ? <button type="button" className="outline-button" disabled={!canOperate} onClick={() => { setMessage(""); setBotComposerOpen(true); }}>Convidar com o bot</button> : null}<button type="button" className="primary-button" disabled={!canOperate} onClick={openComposer}>
          {canOperate ? "Conectar contas" : "Somente leitura"}
        </button></div>
      </div>
      {message && !composerOpen ? <p className={`connect-queue-msg ${error ? "error" : ""}`}>{message}</p> : null}

      {mine.length ? (
        <div className="connect-queue-list">
          {mine.map((item) => (
            <article key={item.id} className={`connect-queue-row ${item.status}`}>
              <strong>@{item.username}</strong>
              <small>{item.metaAppLabel}</small>
              {item.inviteMode === "automatic" && (item.status === "pending" || item.status === "processing") ? <span className="queue-status pending">Aguardando bot</span> : null}
              {item.inviteMode === "automatic" && item.status === "failed" ? <span className="queue-status pending">Falha do bot{item.inviteLastError ? ` · ${item.inviteLastError}` : ""}</span> : null}
              {item.inviteMode !== "automatic" && item.status === "pending" && !canDirectConnect ? <span className="queue-status pending">Aguardando liberação</span> : null}
              <span className="connect-queue-actions">
                {item.status === "invited" || (item.inviteMode !== "automatic" && item.status === "pending" && canDirectConnect) ? (
                  <>
                    <a className="outline-button" href={inviteUrl} target="_blank" rel="noreferrer">Aceitar no Instagram</a>
                    <button type="button" className="primary-button" disabled={busy} onClick={() => startConnect(item.metaAppKey)}>Conectar</button>
                  </>
                ) : null}
                <button type="button" className="text-button" disabled={busy || !canOperate} onClick={() => void cancelItems([item.id])}>Remover</button>
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
                  {item.inviteMode === "automatic" ? <span className="queue-status pending">{item.status === "failed" ? `Falha do bot${item.inviteLastError ? ` · ${item.inviteLastError}` : ""}` : "Aguardando bot"}</span> : null}
                  <button type="button" className="text-button" disabled={busy} onClick={() => void cancelItems([item.id])}>Remover</button>
                </article>
              ))}
            </div>
          )) : <p className="connect-queue-empty">Nenhum perfil pendente nas outras contas.</p>}
        </div>
      ) : null}

      {botComposerOpen ? <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setBotComposerOpen(false); }}>
        <div className="import-modal connect-queue-modal" role="dialog" aria-modal="true" aria-labelledby="bot-invite-title">
          <button type="button" className="modal-close" onClick={() => setBotComposerOpen(false)} aria-label="Fechar">×</button>
          <h2 id="bot-invite-title">Convidar com o bot</h2>
          <label>Instagram @<input value={botUsername} onChange={(event) => setBotUsername(event.target.value)} placeholder="@perfil" /></label>
          {botApps.length > 1 ? <label>App Meta atribuído<select value={botApp} onChange={(event) => setBotApp(event.target.value)}>{botApps.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}</select></label> : null}
          {message ? <p role={error ? "alert" : "status"}>{message}</p> : null}
          <button type="button" className="primary-button" disabled={busy || !canOperate} onClick={() => void requestBotInvite()}>Pedir convite</button>
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
                  <button key={choice.key} type="button" className={app === choice.key ? "active" : ""} aria-pressed={app === choice.key} onClick={() => setApp(choice.key)} disabled={busy}>{choice.label}</button>
                ))}
              </div>
            ) : null}
            <button type="button" className="primary-button" disabled={!canOperate || busy} onClick={() => startConnect(app)}>Conectar com {selectedApp}</button>
          </div>
        </div>
      ) : null}

    </section>
  );
}
