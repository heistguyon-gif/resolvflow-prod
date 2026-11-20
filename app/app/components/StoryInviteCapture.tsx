"use client";

import { useEffect, useId, useRef, useState } from "react";
import { normalizeInstagramInviteUsername } from "../../lib/meta-invite-username";
import { confirmedInstagramUsername, invitationAccount, matchesInviteAccount, type InviteAccount, type InviteBrowser } from "./storyBrowserIdentity";
import styles from "./StoryInviteCapture.module.css";

const endpoint = "/api/meta/connect-queue";
type App = { key: string; label: string };
type QueueItem = { username: string; metaAppKey: string; metaAppLabel?: string; status: string };
type Queue = { canBotInvite: boolean; botApps: App[]; mine: QueueItem[] };
type Receipt = { username: string; appKey: string; appLabel: string; requestedAppKey?: string; requestedAppLabel?: string; state: "uncertain" | "registered" | "existing" | "rejected" | "not_sent"; detail: string };
type Review = { app: App; accounts: InviteAccount[] };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const queueDetail = (status: string) => ({ pending: "Já na fila · aguardando bot. Não reenviado.", processing: "O bot está processando o pedido existente. Não reenviado.", invited: "A fila informa convite enviado. Falta aceitar no Instagram. Não reenviado.", failed: "Há um pedido com falha. Confira os detalhes na aba Contas antes de solicitar novamente." })[status] || "Pedido existente. Confira a fila na aba Contas.";
const actualAppLabel = (item: QueueItem, queue: Queue) => queue.botApps.find(app => app.key === item.metaAppKey)?.label || item.metaAppLabel || "App Meta do pedido (nome indisponível)";
function existingReceipt(receipt: Receipt, item: QueueItem, queue: Queue): Receipt {
  const sameApp = item.metaAppKey === (receipt.requestedAppKey || receipt.appKey);
  return { ...receipt, appKey: item.metaAppKey, appLabel: actualAppLabel(item, queue), state: "existing", detail: sameApp ? `Pedido localizado na fila deste App. ${queueDetail(item.status)}` : `Pedido já existente em outro App, não alterado. App do pedido: ${actualAppLabel(item, queue)}. Isto não confirma um pedido para ${receipt.requestedAppLabel || receipt.appLabel}.` };
}
function parseQueue(value: unknown): Queue {
  if (!record(value) || typeof value.canBotInvite !== "boolean" || !Array.isArray(value.botApps) || !value.botApps.every(app => record(app) && typeof app.key === "string" && app.key.startsWith("workspace:") && typeof app.label === "string") || !Array.isArray(value.mine) || !value.mine.every(item => record(item) && normalizeInstagramInviteUsername(item.username) && typeof item.metaAppKey === "string" && typeof item.status === "string")) throw new Error("A fila respondeu em um formato inesperado. Nenhum pedido será enviado.");
  return { canBotInvite: value.canBotInvite, botApps: value.botApps as App[], mine: (value.mine as QueueItem[]).map(item => ({ ...item, username: normalizeInstagramInviteUsername(item.username)! })) };
}
function restoreReceipts(raw: string | null): Receipt[] {
  try {
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((item): item is Receipt => record(item) && normalizeInstagramInviteUsername(item.username) === item.username && typeof item.appKey === "string" && typeof item.appLabel === "string" && ["uncertain", "registered", "existing", "rejected", "not_sent"].includes(String(item.state)) && typeof item.detail === "string").slice(0, 500) : [];
  } catch { return []; }
}
async function request(init: RequestInit, signal: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();
  const timeout = window.setTimeout(abort, 15000);
  try {
    const response = await fetch(endpoint, { credentials: "same-origin", redirect: "error", cache: "no-store", ...init, signal: controller.signal });
    const body: unknown = await response.json().catch(() => null);
    return { response, body };
  }
  finally { window.clearTimeout(timeout); signal.removeEventListener("abort", abort); }
}

export function StoryInviteCapture({ browsers, fresh, scopeKey, canOperate }: { browsers: InviteBrowser[]; fresh: boolean; scopeKey: string; canOperate: boolean }) {
  const id = useId();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [selected, setSelected] = useState<InviteAccount[]>([]);
  const [appKey, setAppKey] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const alive = useRef(false);
  const busy = useRef(false);
  const reading = useRef(false);
  const loaded = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const current = useRef({ browsers, fresh });
  const receiptRef = useRef<Receipt[]>([]);
  const storageKey = `resolvflow:story-invites:${scopeKey}`;
  const editable = canOperate && !forbidden;
  const locked = sending || !!review;
  const held = (username: string) => receipts.some(item => item.username === username && !["rejected", "not_sent"].includes(item.state));
  const inQueue = (username: string) => queue?.mine.find(item => item.username === username);
  const active = selected.filter(account => fresh && browsers.some(browser => matchesInviteAccount(browser, account)) && !inQueue(account.username) && !held(account.username));
  const app = queue?.botApps.find(app => app.key === appKey);
  const ready = editable && fresh && queue?.canBotInvite === true && !!app && active.length > 0 && !loading && !locked;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    current.current = { browsers, fresh };
    const timer = window.setTimeout(() => {
      if (alive.current) setSelected(previous => previous.filter(account => fresh && browsers.some(browser => matchesInviteAccount(browser, account))));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [browsers, fresh]);

  function saveReceipt(item: Receipt) {
    if (!alive.current) return;
    const next = [item, ...receiptRef.current.filter(previous => previous.username !== item.username)].slice(0, 500);
    receiptRef.current = next; setReceipts(next);
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { setStorageWarning("Mantenha esta aba aberta para conferir os pedidos. O navegador não permitiu guardar os recibos desta sessão."); }
  }
  async function fetchQueue(signal: AbortSignal) {
    const { response, body } = await request({ method: "GET" }, signal);
    if (!response.ok) throw new Error(response.status === 401 ? "Sua sessão expirou. Entre novamente para conferir a fila." : response.status === 403 ? "A fila não está disponível para sua permissão." : "Não foi possível consultar a fila. Nenhum novo pedido foi enviado.");
    return parseQueue(body);
  }
  function applyQueue(snapshot: Queue) {
    if (!alive.current) return;
    setQueue(snapshot);
    setAppKey(previous => snapshot.botApps.some(app => app.key === previous) ? previous : "");
    setSelected(previous => previous.filter(account => !snapshot.mine.some(item => item.username === account.username)));
    for (const item of receiptRef.current.filter(item => ["uncertain", "existing"].includes(item.state))) {
      const found = snapshot.mine.find(row => row.username === item.username);
      if (found) saveReceipt(existingReceipt(item, found, snapshot));
    }
  }
  async function load() {
    if (reading.current || busy.current) return;
    reading.current = true; setLoading(true); setError("");
    const abort = new AbortController(); controller.current = abort;
    try {
      if (!loaded.current) {
        try { const restored = restoreReceipts(sessionStorage.getItem(storageKey)); receiptRef.current = restored; setReceipts(restored); }
        catch { setStorageWarning("O navegador não permitiu ler recibos anteriores. Confira a fila antes de enviar."); }
        loaded.current = true;
      }
      applyQueue(await fetchQueue(abort.signal));
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Não foi possível consultar a fila."); }
    finally { reading.current = false; if (alive.current) setLoading(false); }
  }
  function startReview() {
    if (!ready || busy.current || !app) return;
    setError(""); setReview({ app: { ...app }, accounts: active.map(account => ({ ...account })) });
  }
  async function send() {
    if (!review || busy.current || !editable || !fresh) return;
    busy.current = true; setSending(true); setError("");
    const snapshot = review;
    const abort = new AbortController(); controller.current = abort;
    let stop = false;
    try {
      const latest = await fetchQueue(abort.signal);
      if (!alive.current) return;
      applyQueue(latest);
      if (!latest.canBotInvite || !latest.botApps.some(app => app.key === snapshot.app.key)) { setError("O bot ou o App selecionado deixou de estar disponível. Revise a autorização antes de continuar."); return; }
      for (const account of snapshot.accounts) {
        if (!alive.current || abort.signal.aborted) return;
        const base = { username: account.username, appKey: snapshot.app.key, appLabel: snapshot.app.label, requestedAppKey: snapshot.app.key, requestedAppLabel: snapshot.app.label };
        if (stop) { saveReceipt({ ...base, state: "not_sent", detail: "Não executado após a interrupção anterior." }); continue; }
        const existing = latest.mine.find(item => item.username === account.username);
        if (existing) { saveReceipt(existingReceipt({ ...base, state: "existing", detail: "" }, existing, latest)); continue; }
        if (receiptRef.current.some(item => item.username === account.username && !["rejected", "not_sent"].includes(item.state))) continue;
        if (!current.current.fresh || !current.current.browsers.some(browser => matchesInviteAccount(browser, account))) { saveReceipt({ ...base, state: "not_sent", detail: "A identidade ou a disponibilidade mudou. Selecione a conta novamente após conferir o @." }); continue; }
        // Persist a conservative receipt before the request; there is no replay-safe POST in this API.
        saveReceipt({ ...base, state: "uncertain", detail: "Registro ainda não confirmado. Consulte a fila antes de qualquer nova tentativa." });
        try {
          const { response, body } = await request({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ usernames: `@${account.username}`, metaAppKey: snapshot.app.key, inviteMode: "automatic" }) }, abort.signal);
          if (!alive.current) return;
          if (response.status === 409) { saveReceipt({ ...base, appKey: "", appLabel: "App do pedido existente · conferir fila", state: "existing", detail: "Já existe um pedido na fila. O pedido atual foi mantido; seu App será identificado ao conferir a fila. Nenhum novo envio foi confirmado." }); continue; }
          if ([400, 401, 403].includes(response.status)) {
            saveReceipt({ ...base, state: "rejected", detail: record(body) && typeof body.error === "string" ? body.error.slice(0, 500) : "A API recusou este pedido. Confira a permissão e o App." });
            if ([401, 403].includes(response.status)) { setForbidden(true); stop = true; }
            continue;
          }
          if (!response.ok || !record(body) || body.created !== 1 || !Array.isArray(body.mine) || !body.mine.some(item => record(item) && normalizeInstagramInviteUsername(item.username) === account.username && item.metaAppKey === snapshot.app.key)) throw new Error("unconfirmed");
          saveReceipt({ ...base, state: "registered", detail: "Pedido registrado na fila. Aguarda o bot; registro não significa convite enviado ou aceito." });
        } catch {
          if (!alive.current) return;
          saveReceipt({ ...base, state: "uncertain", detail: "O recebimento não foi confirmado. O pedido pode ter sido salvo. Confira a fila; não haverá reenvio automático." });
          stop = true;
        }
      }
      try { applyQueue(await fetchQueue(abort.signal)); }
      catch { if (alive.current) setError("Não foi possível atualizar a fila. Os resultados acima foram preservados; use Conferir fila, sem reenviar."); }
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : "Não foi possível conferir a autorização. Nenhum pedido foi enviado.");
    } finally {
      busy.current = false;
      if (alive.current) { setSending(false); setReview(null); setSelected([]); }
    }
  }

  return <details className={styles.root} data-story-invites onToggle={event => { if (event.currentTarget.open && !queue) void load(); }}>
    <summary>Convidar contas abertas<span>Capture os @ confirmados e escolha o App Meta autorizado.</span></summary>
    <div className={styles.content}>
      <p>Esta ação só solicita convites ao bot existente. Cada conta ainda precisa receber e aceitar o convite no Instagram.</p>
      {!editable && <p className={styles.warning}>Somente leitura. É necessária permissão de editor para solicitar convites.</p>}
      {error && <p role="alert" className={styles.warning}>{error}</p>}
      {storageWarning && <p className={styles.warning}>{storageWarning}</p>}
      <button type="button" disabled={loading || sending} onClick={() => void load()}>{loading ? "Consultando fila…" : "Conferir fila"}</button>
      {queue && !queue.canBotInvite && <p className={styles.warning}>O bot de convite não está habilitado para este workspace.</p>}
      {queue?.canBotInvite && !queue.botApps.length && <p className={styles.warning}>Nenhum App Meta autorizado para este login. Atribua um App antes de solicitar convites.</p>}
      <fieldset disabled={!editable || loading || locked || !fresh || !queue?.canBotInvite}>
        <legend>Contas para convite</legend><p className={styles.help}>Somente @ confirmado pela extensão nos últimos 75 segundos. Sem seleção automática; até 50 contas por revisão.</p>
        <div className={styles.selectionActions}><button type="button" onClick={() => setSelected(browsers.flatMap(browser => { const account = invitationAccount(browser); return account && !inQueue(account.username) && !held(account.username) ? [account] : []; }).filter((account, index, all) => all.findIndex(item => item.username === account.username) === index).slice(0, 50))}>Selecionar contas disponíveis</button><button type="button" disabled={!active.length} onClick={() => setSelected([])}>Limpar contas</button></div>
        <p aria-live="polite">{active.length} conta{active.length === 1 ? " selecionada" : "s selecionadas"} para convite</p>
        <ul className={styles.accounts}>{browsers.map(browser => {
          const account = invitationAccount(browser); const username = confirmedInstagramUsername(browser);
          const existing = username ? inQueue(username) : undefined;
          const checked = active.some(account => matchesInviteAccount(browser, account));
          const duplicate = !!username && active.some(account => account.username === username && account.browserId !== browser.id);
          return <li key={browser.id}><label><input type="checkbox" aria-label={username ? `Convidar @${username}. Instagram ID ${browser.instagramUserId}` : `Convite indisponível para ${browser.label}`} disabled={!account || !!existing || !!username && held(username) || duplicate || !checked && active.length >= 50} checked={checked} onChange={event => { if (!account) return; setSelected(previous => event.target.checked ? [...previous.filter(item => item.username !== account.username), account] : previous.filter(item => item.username !== account.username)); }} /><span><strong>{username ? `@${username}` : browser.label}</strong><span>Instagram ID: {browser.instagramUserId || "indisponível"}</span><span>{existing ? `${appKey && existing.metaAppKey !== appKey ? "Pedido já existente em outro App, não alterado. " : ""}${queueDetail(existing.status)} App: ${actualAppLabel(existing, queue!)}` : username && held(username) ? "Pedido já registrado ou em conferência nesta sessão." : username ? browser.label : "@ não confirmado ou sinal antigo · não será enviado"}</span></span></label></li>;
        })}</ul>
        <label className={styles.appLabel} htmlFor={`${id}-app`}>App Meta para convite<select id={`${id}-app`} value={appKey} onChange={event => setAppKey(event.target.value)}><option value="">Escolha um App Meta autorizado</option>{queue?.botApps.map(app => <option key={app.key} value={app.key}>{app.label}</option>)}</select></label>
      </fieldset>
      <button type="button" className={styles.primary} disabled={!ready} onClick={startReview}>Revisar convites</button>
      {!!receipts.length && <section className={styles.results} aria-label="Resultados dos pedidos de convite"><h3>Pedidos de convite</h3><ul>{receipts.map(item => <li key={item.username}><strong>@{item.username}</strong><span>{item.appLabel}</span><span data-invite-state={item.state}>{({ registered: "Na fila", existing: "Pedido existente", uncertain: "Incerto · conferir fila", rejected: "Pedido recusado", not_sent: "Não executado" })[item.state]}</span><p>{item.detail}</p></li>)}</ul><p className={styles.help}>Consulte a aba Contas para acompanhar envio e aceite. Este painel não confirma conexão nem reenvia pedidos incertos.</p></section>}
    </div>
    {review && <InviteReview review={review} sending={sending} blocked={!fresh || !editable} onCancel={() => { if (!busy.current) setReview(null); }} onConfirm={() => void send()} />}
  </details>;
}

function InviteReview({ review, sending, blocked, onCancel, onConfirm }: { review: Review; sending: boolean; blocked: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null); const id = useId();
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = dialog.current; node?.showModal();
    return () => { node?.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); if (!sending) onCancel(); }} onKeyDown={event => {
    if (event.key !== "Tab") return;
    const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    const first = nodes[0]; const last = nodes.at(-1);
    if (!first || !last) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
  }}><h2 id={`${id}-title`}>Revisar convites</h2><p>App Meta: <strong>{review.app.label}</strong></p><ul>{review.accounts.map(account => <li key={account.username}><strong>@{account.username}</strong><span>Instagram ID {account.instagramUserId} · {account.label}</span></li>)}</ul><p>Serão solicitados pedidos à fila, um por conta. Enfileirar não significa convite enviado, aceito ou conta conectada.</p><div className={styles.dialogActions}><button type="button" disabled={sending} onClick={onCancel}>Voltar à seleção</button><button type="button" className={styles.primary} disabled={sending || blocked} onClick={onConfirm}>{sending ? "Registrando pedidos…" : "Confirmar pedidos de convite"}</button></div></dialog>;
}
