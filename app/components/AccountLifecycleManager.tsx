"use client";

import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useMemo, useState } from "react";

type AccountRow = { id: string; username: string; archivedAt?: string | null; queueCount?: number; published30d?: number; views30d?: number; reach30d?: number };

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Não foi possível concluir a ação.");
  return body;
}

export function AccountLifecycleManager() {
  const [active, setActive] = useState<AccountRow[]>([]);
  const [archived, setArchived] = useState<AccountRow[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const [activePayload, archivedPayload] = await Promise.all([api("/api/accounts?limit=500"), api("/api/accounts?limit=500&archived=only&stats=1")]);
    setActive(activePayload.accounts || []); setArchived(archivedPayload.accounts || []);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load().catch((error) => setMessage(error.message)); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const filteredActive = useMemo(() => active.filter((item) => item.username.toLowerCase().includes(query.toLowerCase())).slice(0, 30), [active, query]);
  const change = async (account: AccountRow, action: "archive" | "restore") => {
    if (action === "archive" && !window.confirm(`Arquivar @${account.username}?\n\nA conexão será desativada e os posts futuros ficarão pausados. Histórico, campanhas, tentativas, views e alcance serão preservados.`)) return;
    setBusy(account.id); setMessage("");
    try {
      await api("/api/accounts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ids: [account.id] }) });
      setMessage(action === "archive" ? `@${account.username} foi arquivada sem apagar o histórico.` : `@${account.username} foi restaurada. Reconecte-a à Meta para voltar a publicar.`);
      await load();
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha na ação."); } finally { setBusy(null); }
  };
  const removePermanently = async (account: AccountRow) => {
    const confirmation = window.prompt(`Exclusão permanente apaga o histórico da Resolve Flow para @${account.username}.\n\nDigite EXCLUIR para confirmar:`);
    if (confirmation !== "EXCLUIR") return;
    setBusy(account.id); setMessage("");
    try {
      await api("/api/accounts", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [account.id], confirmation }) });
      setMessage(`@${account.username} foi excluída permanentemente.`); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha na exclusão."); } finally { setBusy(null); }
  };
  return <details className="panel account-lifecycle-manager"><summary><span><b>Arquivamento de contas</b><small>Desconecte sem perder histórico, métricas ou campanhas</small></span><em>{archived.length} arquivada(s)</em></summary><div className="account-lifecycle-content">{message ? <p className="account-lifecycle-message" role="status">{message}</p> : null}<section><header><strong>Contas ativas</strong><input aria-label="Buscar conta para arquivar" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar @" /></header><div className="account-lifecycle-list">{filteredActive.map((account) => <article key={account.id}><span><b>@{account.username}</b><small>{account.queueCount || 0} na fila</small></span><button type="button" className="outline-button compact-button" disabled={busy === account.id} onClick={() => void change(account, "archive")}>Arquivar e desconectar</button></article>)}{!filteredActive.length ? <p>Nenhuma conta ativa encontrada.</p> : null}</div></section><section><header><strong>Contas arquivadas</strong><small>Histórico preservado</small></header><div className="account-lifecycle-list">{archived.map((account) => <article key={account.id}><span><b>@{account.username}</b><small>{account.published30d || 0} publicações · {account.views30d || 0} views · {account.reach30d || 0} alcance</small></span><span className="account-lifecycle-actions"><button type="button" className="primary-button compact-button" disabled={busy === account.id} onClick={() => void change(account, "restore")}>Restaurar</button><button type="button" className="text-button danger-action" disabled={busy === account.id} onClick={() => void removePermanently(account)}>Excluir permanentemente</button></span></article>)}{!archived.length ? <p>Nenhuma conta arquivada.</p> : null}</div></section></div></details>;
}

export function mountAccountLifecycleManager() {
  if (typeof document === "undefined") return;
  const scope = globalThis as typeof globalThis & { __resolvflowAccountLifecycle?: boolean };
  if (scope.__resolvflowAccountLifecycle) return;
  scope.__resolvflowAccountLifecycle = true;
  const mount = () => {
    const page = document.querySelector(".accounts-page");
    if (!page || page.querySelector(".account-lifecycle-host")) return;
    const host = document.createElement("div"); host.className = "account-lifecycle-host"; page.append(host);
    createRoot(host).render(<AccountLifecycleManager />);
  };
  queueMicrotask(mount);
  new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
}
