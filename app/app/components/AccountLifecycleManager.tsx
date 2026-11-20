"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./AccountLifecycleManager.module.css";
import { loadAccountsCatalog } from "../lib/accountsCatalog";
import { createCampaignReadGuard } from "../lib/campaignReadGuard";

type AccountRow = { id: string; username: string; archivedAt?: string | null; queueCount?: number; published30d?: number; views30d?: number; reach30d?: number };

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  const body = await response.json().catch(() => ({})) as {error?:string;accounts?:AccountRow[]};
  if (!response.ok) throw new Error(body.error || "Não foi possível concluir a ação.");
  return body;
}

type LifecycleProps = { canManage?: boolean; contextKey: string };
export function AccountLifecycleManager(props: LifecycleProps) {
  return <AccountLifecycleSession key={props.contextKey} {...props} />;
}

function AccountLifecycleSession({ canManage = false, contextKey }: LifecycleProps) {
  const [active, setActive] = useState<AccountRow[]>([]);
  const [archived, setArchived] = useState<AccountRow[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reloadRef = useRef<number | undefined>(undefined);
  const mountedRef = useRef(false);
  const reads = useRef(createCampaignReadGuard());
  const [hasComplete, setHasComplete] = useState(false);
  const load = useCallback(async () => {
    if (!contextKey || !mountedRef.current) return false;
    const request = reads.current.begin(contextKey);
    setLoading(true); setLoadError("");
    try {
      const fetchPage = (url: string, init?: RequestInit) => fetch(url, { credentials: "same-origin", ...init });
      const options = { signal: request.signal, isCurrent: request.current };
      const [activePayload, archivedPayload] = await Promise.all([
        loadAccountsCatalog<AccountRow>(fetchPage, options),
        loadAccountsCatalog<AccountRow>(fetchPage, { ...options, filters: { archived: "only", stats: "1" } }),
      ]);
      if (!request.current() || !mountedRef.current) return false;
      // Both catalogs commit together. A failed page never replaces either with a prefix.
      setActive(activePayload.accounts); setArchived(archivedPayload.accounts); setHasComplete(true);
      return true;
    } catch (error) {
      if (request.current() && mountedRef.current) {
        setLoadError(`${error instanceof Error ? error.message : "Falha na leitura."} A última lista completa foi preservada; atualize antes de operar.`);
      }
      return false;
    } finally {
      if (request.current() && mountedRef.current) { setLoading(false); reads.current.cancel(); }
    }
  }, [contextKey]);
  useEffect(() => {
    mountedRef.current = true;
    const guard = reads.current;
    guard.setWorkspace(contextKey);
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => { mountedRef.current = false; guard.cancel(); window.clearTimeout(timer); window.clearTimeout(reloadRef.current); };
  }, [load, contextKey]);
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = previousOverflow; if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, [open]);
  const filteredActive = useMemo(() => active.filter((item) => item.username.toLowerCase().includes(query.toLowerCase())).slice(0, 30), [active, query]);
  const change = async (account: AccountRow, action: "archive" | "restore") => {
    if (!canManage || busy || loading || loadError || !hasComplete || !mountedRef.current) return;
    if (action === "archive" && !window.confirm(`Arquivar @${account.username}?\n\nA conexão será desativada e as pendências canceláveis serão canceladas. Envios já iniciados podem concluir. Histórico, campanhas, tentativas, views e alcance serão preservados.`)) return;
    setBusy(account.id); setMessage("");
    try {
      await api("/api/accounts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ids: [account.id] }) });
      if (!mountedRef.current) return;
      setMessage(action === "archive" ? `@${account.username} foi arquivada sem apagar o histórico.` : `@${account.username} foi restaurada. Reconecte-a à Meta para voltar a publicar. Posts cancelados não serão retomados.`);
      const complete = await load();
      if (complete && mountedRef.current) reloadRef.current = window.setTimeout(() => window.location.reload(), 500);
    } catch (error) { if (mountedRef.current) setMessage(error instanceof Error ? error.message : "Falha na ação."); } finally { if (mountedRef.current) setBusy(null); }
  };
  return <>
    <button ref={triggerRef} type="button" className={styles.trigger} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>Arquivadas <span aria-label={loading ? "Carregando contagem" : loadError ? "Contagem indisponível" : `${archived.length} contas arquivadas`}>{loading ? "…" : loadError ? "—" : archived.length}</span></button>
    {open ? createPortal(<dialog ref={dialogRef} className={styles.dialog} aria-labelledby="archived-accounts-title" onCancel={() => setOpen(false)} onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')).filter((element) => element.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <header className={styles.heading}><div><h2 id="archived-accounts-title">Contas arquivadas</h2><p>Histórico, métricas e campanhas preservados.</p></div><button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Fechar contas arquivadas">Fechar <span aria-hidden="true">×</span></button></header>
      <div className={styles.body}>
        {!canManage ? <p className={styles.notice}>Somente o proprietário do workspace pode arquivar, restaurar contas.</p> : null}
        {message ? <p className={styles.notice} role="status">{message}</p> : null}
        {loading ? <p role="status">Carregando catálogo completo de contas…</p> : null}
        {loadError ? <div role="alert" className={styles.notice}>{loadError} <button type="button" disabled={loading || busy !== null} onClick={() => void load()}>Tentar novamente</button></div> : null}
        {hasComplete ? <>
          <section aria-label="Lista de contas arquivadas" className={styles.section}>
            <div className={styles.list}>{archived.map((account) => <article key={account.id}><div><strong>@{account.username}</strong><small>Arquivada em {account.archivedAt ? new Date(account.archivedAt).toLocaleString("pt-BR") : "data indisponível"}</small><small>{account.published30d || 0} publicações · {account.views30d || 0} views · {account.reach30d || 0} alcance</small></div><div className={styles.actions}><button type="button" disabled={!canManage || busy !== null || loading || Boolean(loadError)} onClick={() => void change(account, "restore")}>Restaurar</button></div></article>)}{!archived.length ? <p className={styles.empty}>Nenhuma conta arquivada.</p> : null}</div>
          </section>
          <section aria-labelledby="archive-active-title" className={styles.section}>
            <header><div><h3 id="archive-active-title">Arquivar uma conta ativa</h3><p>Desconecta a conta e cancela publicações ainda não enviadas, sem apagar o histórico.</p></div><input aria-label="Buscar conta para arquivar" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar @" /></header>
            <div className={styles.list}>{filteredActive.map((account) => <article key={account.id}><div><strong>@{account.username}</strong><small>{account.queueCount || 0} na fila</small></div><button type="button" disabled={!canManage || busy !== null || loading || Boolean(loadError)} onClick={() => void change(account, "archive")}>Arquivar e desconectar</button></article>)}{!filteredActive.length ? <p className={styles.empty}>Nenhuma conta ativa encontrada.</p> : null}</div>
          </section>
        </> : null}
      </div>
    </dialog>, document.body) : null}
  </>;
}
