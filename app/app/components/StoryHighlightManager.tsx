"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import styles from "./StoryHighlightManager.module.css";

type Target = { browserId: string; sessionId: string; instagramUserId: string };
type Browser = { id: string; sessionId: string; instagramUserId: string; label: string; available: boolean; capabilities?: { highlightManagement?: number } | null };
type Highlight = { id: string; title: string };
type Status = "queued" | "claimed" | "completed" | "failed" | "uncertain" | "expired";
type Operation = { id: string; requestId: string; action: "list" | "delete"; target: Target; label: string; status: Status; message: string; createdAt: string; completedAt?: string; highlights?: Highlight[]; highlightId?: string; highlightTitle?: string };
type Snapshot = { browsers: Browser[]; operations: Operation[]; serverTime: number };
type Attempt = { action: "list" | "delete"; requestId: string; target: Target; label: string; listOperationId?: string; highlightId?: string; confirmedTitle?: string };
type Confirmation = { listOperationId: string; highlight: Highlight; target: Target; label: string };
type Props = { scopeKey: string; active?: boolean; onAccessRevoked?: () => void };
const endpoint = "/api/story-bridge/highlights";
const statuses: Status[] = ["queued", "claimed", "completed", "failed", "uncertain", "expired"];
const statusLabel: Record<Status, string> = { queued: "Aguardando navegador", claimed: "Em execução", completed: "Concluído", failed: "Falhou", uncertain: "Resultado incerto", expired: "Expirado" };
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const text = (value: unknown): value is string => typeof value === "string";
const identifier = (value: unknown): value is string => text(value) && value.length > 0;
const date = (value: unknown): value is string => text(value) && Number.isFinite(Date.parse(value));
function isTarget(value: unknown): value is Target {
  return record(value) && identifier(value.browserId) && identifier(value.sessionId) && text(value.instagramUserId) && /^\d{1,30}$/.test(value.instagramUserId);
}
function sameTarget(a: Target, b: Target) { return a.browserId === b.browserId && a.sessionId === b.sessionId && a.instagramUserId === b.instagramUserId; }
function targetOf(browser: Browser): Target { return { browserId: browser.id, sessionId: browser.sessionId, instagramUserId: browser.instagramUserId }; }
function isBrowser(value: unknown): value is Browser {
  return record(value) && identifier(value.id) && identifier(value.sessionId) && text(value.instagramUserId)
    && (/^\d{1,30}$/.test(value.instagramUserId) || (value.instagramUserId === "" && value.available === false))
    && text(value.label) && typeof value.available === "boolean" && (value.capabilities == null || record(value.capabilities));
}
function isHighlight(value: unknown): value is Highlight { return record(value) && text(value.id) && /^highlight:\d+$/.test(value.id) && text(value.title); }
function isOperation(value: unknown): value is Operation {
  if (!record(value) || !identifier(value.id) || !identifier(value.requestId) || !["list", "delete"].includes(String(value.action)) || !isTarget(value.target) || !text(value.label) || !statuses.includes(value.status as Status) || !text(value.message) || !date(value.createdAt)) return false;
  if (value.completedAt !== undefined && !date(value.completedAt)) return false;
  if (value.highlights !== undefined && (!Array.isArray(value.highlights) || value.highlights.length > 500 || !value.highlights.every(isHighlight) || new Set(value.highlights.map(item => item.id)).size !== value.highlights.length)) return false;
  if (value.action === "list" && value.status === "completed" && !Array.isArray(value.highlights)) return false;
  return value.action !== "delete" || (text(value.highlightId) && /^highlight:\d+$/.test(value.highlightId) && text(value.highlightTitle));
}
function isSnapshot(value: unknown): value is Snapshot {
  return record(value) && Array.isArray(value.browsers) && value.browsers.every(isBrowser) && new Set(value.browsers.map(item => item.id)).size === value.browsers.length
    && Array.isArray(value.operations) && value.operations.every(isOperation) && new Set(value.operations.map(item => item.id)).size === value.operations.length
    && typeof value.serverTime === "number" && Number.isFinite(value.serverTime) && value.serverTime > 0;
}
function operationText(operation: Operation) {
  if (operation.status === "uncertain") return "Não há confirmação do resultado. Confira o perfil; não repita a exclusão. O recibo foi preservado.";
  if (operation.status === "completed") return operation.action === "list" ? "Consulta completa recebida." : "Exclusão confirmada pelo navegador.";
  if (operation.status === "queued") return "Aguardando a extensão do perfil selecionado. Não é necessário enviar novamente.";
  if (operation.status === "claimed") return "A extensão recebeu a solicitação. Acompanhe o recibo abaixo.";
  if (operation.message === "identity_changed" || operation.message === "session_changed") return "A identidade ou a sessão mudou. Selecione o perfil novamente e confira o resultado.";
  if (operation.message === "extension_update_required") return "Atualize a extensão deste perfil para gerenciar destaques.";
  return operation.action === "list" ? "A consulta não foi concluída. Isso não significa que o perfil não tenha destaques." : "A exclusão não foi confirmada. Nenhuma repetição será feita automaticamente.";
}
function rejection(code: unknown) {
  const messages: Record<string, string> = {
    extension_update_required: "Atualize a extensão do perfil para gerenciar destaques.",
    stale_list: "Esta consulta expirou. Consulte os destaques novamente antes de selecionar uma exclusão.",
    list_expired: "Esta consulta expirou. Consulte os destaques novamente antes de selecionar uma exclusão.",
    busy: "O perfil já tem uma operação em andamento. Aguarde o recibo.",
    execution_uncertain: "Há uma exclusão sem resultado confirmado. Confira o perfil; não repita a solicitação.",
    idempotency_conflict: "Esta solicitação já possui um recibo. Atualize os recibos para conferir o resultado.",
  };
  return text(code) && messages[code] || "O servidor não aceitou a solicitação. Atualize os recibos e confira a sessão e a consulta antes de continuar.";
}
const displayTitle = (title: string) => title || "Sem título";
const formatTime = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });

// scopeKey comes from the authenticated user + workspace boundary, never from a shared workspace alone.
export function StoryHighlightManager(props: Props) { return <HighlightManagerSession key={props.scopeKey} {...props} />; }

function HighlightManagerSession({ active = true, onAccessRevoked }: Props) {
  const ids = useId();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [fresh, setFresh] = useState(false);
  const [reading, setReading] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [listRequestId, setListRequestId] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [unknown, setUnknown] = useState<Attempt | null>(null);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState(0);
  const [clock, setClock] = useState({ server: 0, observed: 0 });
  const [attemptedDeletes, setAttemptedDeletes] = useState<Set<string>>(() => new Set());
  const lifetime = useRef(0), readSequence = useRef(0), busy = useRef(false);
  const readController = useRef<AbortController | null>(null), writeController = useRef<AbortController | null>(null);
  const unknownRef = useRef<Attempt | null>(null);
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const accessCallback = useRef(onAccessRevoked);
  useEffect(() => { accessCallback.current = onAccessRevoked; }, [onAccessRevoked]);
  const revoke = useCallback(() => {
    setRevoked(true); setFresh(false); setSnapshot(null); setConfirmation(null); setConfirmed(false);
    accessCallback.current?.();
  }, []);
  const refresh = useCallback(async () => {
    if (!lifetime.current || busy.current || document.visibilityState === "hidden" || readController.current) return;
    const life = lifetime.current, seq = ++readSequence.current, controller = new AbortController(), started = performance.now();
    readController.current = controller;
    setReading(true);
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    const current = () => lifetime.current === life && readSequence.current === seq;
    try {
      const response = await fetch(endpoint, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
      if (!current() || controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) { revoke(); return; }
      if (!response.ok) throw new Error("read_failed");
      const body: unknown = await response.json();
      if (!current() || controller.signal.aborted) return;
      if (!isSnapshot(body)) throw new Error("invalid_snapshot");
      setClock({ server: body.serverTime, observed: started }); setCheckedAt(performance.now());
      setSnapshot(body); setFresh(true); setError("");
      const unresolved = unknownRef.current;
      if (unresolved && body.operations.some(op => op.requestId === unresolved.requestId && sameTarget(op.target, unresolved.target) && op.action === unresolved.action && (op.action === "list" || (op.highlightId === unresolved.highlightId && op.highlightTitle === unresolved.confirmedTitle)))) {
        unknownRef.current = null; setUnknown(null);
      }
    } catch {
      if (current()) { setFresh(false); setConfirmation(null); setConfirmed(false); setError("Não foi possível atualizar os recibos. Os dados anteriores foram preservados, mas novas ações estão bloqueadas até a atualização."); }
    } finally {
      window.clearTimeout(timeout);
      if (readController.current === controller) { readController.current = null; if (current()) setReading(false); }
    }
  }, [revoke]);
  useEffect(() => {
    const life = ++lifetime.current;
    return () => {
      // Request-generation counters, not DOM refs: invalidate the current generation on cleanup.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (lifetime.current === life) ++lifetime.current;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++readSequence.current;
      readController.current?.abort(); writeController.current?.abort();
      readController.current = null; writeController.current = null;
    };
  }, []);
  useEffect(() => {
    if (revoked) return;
    const initial = window.setTimeout(() => { if (active) void refresh(); }, 0);
    const timer = window.setInterval(() => { setCheckedAt(performance.now()); if (active) void refresh(); }, 5000);
    const visibility = () => {
      ++readSequence.current; readController.current?.abort(); readController.current = null;
      setFresh(false); setConfirmation(null); setConfirmed(false);
      if (active && document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [active, refresh, revoked]);
  useEffect(() => {
    if (!confirmation) return;
    confirmationHeading.current?.focus();
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !busy.current) { setConfirmation(null); setConfirmed(false); returnFocus.current?.focus(); }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [confirmation]);

  const browser = target && snapshot?.browsers.find(item => sameTarget(targetOf(item), target));
  const now = (at = checkedAt) => clock.server + Math.max(0, at - clock.observed);
  const isFresh = (at = checkedAt) => fresh && at - clock.observed < 15000;
  const ready = !revoked && isFresh() && browser?.available === true && browser.capabilities?.highlightManagement === 1;
  const list = snapshot?.operations.find(op => op.requestId === listRequestId && op.action === "list" && target && sameTarget(op.target, target));
  const listCurrent = (at = checkedAt) => !!list && list.status === "completed" && Array.isArray(list.highlights) && !!list.completedAt && now(at) - Date.parse(list.completedAt) >= 0 && now(at) - Date.parse(list.completedAt) < 120000;
  const inProgress = snapshot?.operations.some(op => target && sameTarget(op.target, target) && (op.status === "queued" || op.status === "claimed"));
  const deleteBlocked = (highlight: Highlight) => !!list && (attemptedDeletes.has(`${list.id}:${highlight.id}`) || !!snapshot?.operations.some(op => op.action === "delete" && op.target.instagramUserId === target?.instagramUserId && op.highlightId === highlight.id && ["queued", "claimed", "uncertain", "completed"].includes(op.status)));
  const canDelete = (highlight: Highlight, at = checkedAt) => ready && isFresh(at) && listCurrent(at) && !inProgress && !sending && !unknown && !deleteBlocked(highlight);

  async function send(action: "list" | "delete") {
    if (busy.current || unknownRef.current || !target || !ready || !isFresh(performance.now()) || inProgress) return;
    if (action === "delete" && (!confirmed || !confirmation || !sameTarget(confirmation.target, target) || confirmation.listOperationId !== list?.id || !canDelete(confirmation.highlight, performance.now()))) return;
    let requestId: string;
    try { requestId = crypto.randomUUID(); } catch { setError("Não foi possível identificar a solicitação com segurança. Nenhum comando foi enviado."); return; }
    const attempt: Attempt = { action, requestId, target: { ...target }, label: browser?.label || "Perfil", ...(action === "delete" && confirmation ? { listOperationId: confirmation.listOperationId, highlightId: confirmation.highlight.id, confirmedTitle: confirmation.highlight.title } : {}) };
    busy.current = true; setSending(true); setError(""); setFresh(false);
    ++readSequence.current; readController.current?.abort(); readController.current = null; setReading(false);
    if (action === "list") { setListRequestId(requestId); setConfirmation(null); setConfirmed(false); }
    else { setAttemptedDeletes(current => new Set(current).add(`${attempt.listOperationId}:${attempt.highlightId}`)); setConfirmation(null); setConfirmed(false); }
    const life = lifetime.current, controller = new AbortController(); writeController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const body = action === "list" ? { action, requestId, target: attempt.target } : { action, requestId, target: attempt.target, listOperationId: attempt.listOperationId, highlightId: attempt.highlightId, confirmed: true, confirmedTitle: attempt.confirmedTitle };
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      if (lifetime.current !== life) return;
      if (response.status === 401 || response.status === 403) { revoke(); return; }
      const result: unknown = await response.json();
      if (lifetime.current !== life) return;
      if ([400, 409, 422, 429].includes(response.status)) { setError(rejection(record(result) ? result.code : null)); return; }
      if (!response.ok || controller.signal.aborted || !record(result) || !isOperation(result.operation) || result.operation.requestId !== requestId || result.operation.action !== action || !sameTarget(result.operation.target, attempt.target) || (action === "delete" && (result.operation.highlightId !== attempt.highlightId || result.operation.highlightTitle !== attempt.confirmedTitle))) throw new Error("unconfirmed_response");
      const operation = result.operation;
      setSnapshot(current => current ? { ...current, operations: [operation, ...current.operations.filter(op => op.id !== operation.id)] } : current);
    } catch {
      if (lifetime.current === life) { unknownRef.current = attempt; setUnknown(attempt); }
    } finally {
      window.clearTimeout(timeout);
      if (lifetime.current === life) { busy.current = false; setSending(false); writeController.current = null; }
    }
  }

  if (revoked) return null;
  if (!snapshot) return <div className={styles.root}><p role="status">{error || "Verificando acesso e carregando os perfis…"}</p>{error && <button type="button" disabled={reading} onClick={() => void refresh()}>Atualizar recibos</button>}</div>;
  const selectedValue = browser ? browser.id : target ? "stale" : "";
  const receipts = snapshot.operations.filter(op => !target || op.target.instagramUserId === target.instagramUserId).slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return <div className={styles.root}>
    <div className={styles.heading}><div><span className={styles.eyebrow}>Um perfil por vez</span><h2>Gerenciar destaques</h2><p>Consulte os destaques do perfil conectado e escolha um para excluir.</p></div><button type="button" disabled={reading || sending} onClick={() => void refresh()}>{reading ? "Atualizando…" : "Atualizar recibos"}</button></div>
    {error && <p className={styles.warning} role="alert">{error}</p>}
    {unknown && <div className={styles.warning} role="alert"><strong>Recebimento não confirmado</strong><p>{unknown.action === "delete" ? `Exclusão de “${displayTitle(unknown.confirmedTitle || "")}”` : "Consulta de destaques"} · {unknown.label} · Instagram ID {unknown.target.instagramUserId}.</p><p>Atualize os recibos para consultar esta solicitação. Ela não será reenviada; novas ações ficam bloqueadas enquanto o resultado não for identificado.</p><small>Solicitação {unknown.requestId}</small></div>}
    <div className={styles.workspace}>
      <section className={styles.profile} aria-labelledby={`${ids}-profile`}><h3 id={`${ids}-profile`}>Perfil conectado</h3><label htmlFor={`${ids}-select`}>Escolha o perfil<select id={`${ids}-select`} value={selectedValue} disabled={sending || !!unknown} onChange={event => {
        const next = snapshot.browsers.find(item => item.id === event.target.value);
        setTarget(next ? targetOf(next) : null); setListRequestId(""); setConfirmation(null); setConfirmed(false); setError("");
      }}><option value="">Selecione um perfil</option>{selectedValue === "stale" && <option value="stale" disabled>Sessão anterior indisponível · selecione novamente</option>}{snapshot.browsers.map(item => <option key={item.id} value={item.id} disabled={!item.available || item.capabilities?.highlightManagement !== 1}>{item.label} · ID {item.instagramUserId}{!item.available ? " · Indisponível" : item.capabilities?.highlightManagement !== 1 ? " · Atualizar extensão" : ""}</option>)}</select></label>
        {target && <p className={styles.identity}><strong>{browser?.label || "Sessão anterior"}</strong><span>Instagram ID {target.instagramUserId}</span></p>}
        {target && !ready && <p className={styles.warning}>{!browser ? "O perfil mudou de sessão ou identidade. Selecione-o novamente antes de consultar." : browser.capabilities?.highlightManagement !== 1 ? "Atualize a extensão deste perfil para gerenciar destaques." : !browser.available ? "Este perfil não está disponível. Abra o navegador com o Instagram conectado." : "Aguardando atualização dos recibos para liberar ações."}</p>}
        {!snapshot.browsers.length && <p>Nenhum perfil próprio disponível nesta conta.</p>}
        <button className={styles.primary} type="button" disabled={!ready || sending || !!unknown || !!inProgress} onClick={() => void send("list")}>{sending ? "Enviando…" : "Consultar destaques"}</button><p className={styles.note}>A consulta usa a extensão do perfil. Nada é excluído ao consultar.</p>
      </section>
      <section className={styles.results} aria-labelledby={`${ids}-list`} aria-busy={list?.status === "queued" || list?.status === "claimed"}><div className={styles.listHeading}><h3 id={`${ids}-list`}>Destaques do perfil</h3>{list?.status === "completed" && <span>{list.highlights!.length} encontrados</span>}</div>
        {!list && <p className={styles.empty}>{listRequestId ? "Aguardando o recibo da consulta. Atualize os recibos para acompanhar." : "Selecione um perfil e consulte seus destaques para começar."}</p>}
        {list && list.status !== "completed" && <p className={styles.empty} role="status"><strong>{statusLabel[list.status]}</strong><span>{operationText(list)}</span></p>}
        {list?.status === "completed" && <><p className={styles.note}>{list.completedAt ? `Consultado em ${formatTime(list.completedAt)}.` : "Consulta sem horário de conclusão."} {listCurrent() ? "A seleção para exclusão vale por até 2 minutos." : "Consulta expirada. Consulte novamente para excluir."}</p>
          {list.highlights!.length === 0 ? <p className={styles.empty}>Nenhum destaque encontrado nesta consulta completa.</p> : <ul className={styles.highlights}>{list.highlights!.map(item => <li key={item.id}><div><strong>{displayTitle(item.title)}</strong><span>{deleteBlocked(item) ? "Já solicitado · confira o recibo" : item.id}</span></div><button type="button" disabled={!canDelete(item)} aria-label={`Excluir destaque ${displayTitle(item.title)}`} onClick={event => { returnFocus.current = event.currentTarget; setConfirmed(false); setConfirmation({ listOperationId: list.id, highlight: item, target: { ...target! }, label: browser?.label || list.label }); }}>Excluir</button></li>)}</ul>}
        </>}
      </section>
    </div>
    {confirmation && <section className={styles.confirmation} aria-labelledby={`${ids}-confirm`}><h3 id={`${ids}-confirm`} ref={confirmationHeading} tabIndex={-1}>Excluir este destaque?</h3><p>Confira o nome e o perfil antes de confirmar. Esta ação solicita a exclusão de um destaque completo.</p><dl><div><dt>Destaque</dt><dd>{displayTitle(confirmation.highlight.title)}</dd></div><div><dt>Perfil</dt><dd>{confirmation.label}<span>Instagram ID {confirmation.target.instagramUserId}</span></dd></div></dl><label className={styles.check}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>Confirmo excluir “{displayTitle(confirmation.highlight.title)}” de {confirmation.label}.</span></label>{!canDelete(confirmation.highlight) && <p className={styles.warning}>A confirmação perdeu a validade. Confira a conexão e consulte os destaques novamente.</p>}<div className={styles.actions}><button type="button" onClick={() => { setConfirmation(null); setConfirmed(false); returnFocus.current?.focus(); }}>Cancelar</button><button className={styles.danger} type="button" disabled={!confirmed || !canDelete(confirmation.highlight)} onClick={() => void send("delete")}>Confirmar exclusão</button></div></section>}
    <section className={styles.receipts} aria-labelledby={`${ids}-receipts`}><div className={styles.listHeading}><h3 id={`${ids}-receipts`}>Recibos das operações</h3><span>{target ? "Deste perfil" : "Perfis autorizados"}</span></div><p className={styles.note}>O histórico é preservado. Um resultado incerto não autoriza repetir a exclusão.</p><div role="status" aria-live="polite" className={styles.live}>{sending ? "Enviando solicitação…" : receipts[0] ? `${receipts[0].action === "list" ? "Consulta" : "Exclusão"}: ${statusLabel[receipts[0].status]}.` : "Nenhuma operação registrada."}</div>
      <div className={styles.receiptList}>{receipts.map(op => <article key={op.id} className={styles.receipt}><div><strong>{op.action === "list" ? "Consultar destaques" : `Excluir “${displayTitle(op.highlightTitle || "") }”`}</strong><span className={styles.status} data-status={op.status}>{statusLabel[op.status]}</span></div><p>{op.label} · Instagram ID {op.target.instagramUserId}</p><p>{operationText(op)}</p><details><summary>Identificação e horário</summary><p>Solicitado em <time dateTime={op.createdAt}>{formatTime(op.createdAt)}</time></p>{op.completedAt && <p>Finalizado em <time dateTime={op.completedAt}>{formatTime(op.completedAt)}</time></p>}<small>Recibo {op.id}<br />Solicitação {op.requestId}</small></details></article>)}</div>
    </section>
  </div>;
}
