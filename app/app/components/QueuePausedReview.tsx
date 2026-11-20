"use client";
import { useEffect, useRef, useState } from "react";
import { CampaignDialog } from "./CampaignDialog";
import styles from "./QueuePausedReview.module.css";
import type { CampaignPostActivityResponse } from "../../lib/campaign-activity-types";

export type ReviewItem = {
  id: string; campaignId: string; snapshot: string; username: string; campaignName: string; campaignStatus: string | null;
  scheduledFor: string; status: string; lastError: string; reason: string; instruction: string;
  canCancel: boolean; canReschedule: boolean; reviewProtected: boolean;
};
type Review = { items: ReviewItem[]; total: number; protectedTotal: number; eligibleTotal: number; viewTotal: number; page: number; pageSize: number };
type View = "pending" | "protected";
const campaignStatus: Record<string, string> = { scheduled: "Ativa", paused: "Pausada", cancelled: "Cancelada", completed: "Concluída", archived: "Arquivada", draft: "Rascunho" };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function validReview(value: unknown): value is Review {
  if (!object(value) || ![value.total, value.protectedTotal, value.eligibleTotal, value.viewTotal].every(count) || !count(value.page) || value.page < 1 || !count(value.pageSize) || value.pageSize < 1 || value.pageSize > 50 || !Array.isArray(value.items) || value.items.length > value.pageSize) return false;
  return value.items.every(item => object(item) && ["id", "campaignId", "username", "campaignName", "lastError", "reason", "instruction"].every(key => typeof item[key] === "string") && typeof item.snapshot === "string" && /^[a-f0-9]{64}$/.test(item.snapshot) && item.status === "paused" && typeof item.scheduledFor === "string" && Number.isFinite(Date.parse(item.scheduledFor)) && (item.campaignStatus === null || typeof item.campaignStatus === "string") && ["canCancel", "canReschedule", "reviewProtected"].every(key => typeof item[key] === "boolean"));
}
type CancelResult = { cancelled: number; unchanged: number; unknown: number; warnings: string[]; refreshRequired: true };
function validResult(value: unknown, total: number): value is CancelResult {
  return object(value) && count(value.cancelled) && count(value.unchanged) && count(value.unknown) && value.cancelled + value.unchanged + value.unknown === total && value.refreshRequired === true && Array.isArray(value.warnings) && value.warnings.every(item => typeof item === "string");
}
function validHistory(value: unknown, id: string): value is CampaignPostActivityResponse {
  if (!object(value) || !object(value.post) || value.post.id !== id || typeof value.post.status !== "string" || !count(value.post.attemptCount) || !count(value.post.maxAttempts) || typeof value.post.scheduledFor !== "string" || !Number.isFinite(Date.parse(value.post.scheduledFor)) || !Array.isArray(value.attempts) || typeof value.hasMoreAttempts !== "boolean") return false;
  return (value.post.lastError === null || typeof value.post.lastError === "string") && value.attempts.length <= 30 && value.attempts.every(item => object(item) && ["id", "stage", "outcome", "createdAt"].every(key => typeof item[key] === "string") && (item.message === null || typeof item.message === "string"));
}

export function QueuePausedReview({ canOperate, protectedCount, onChanged, onOpenItem }: {
  canOperate: boolean; protectedCount: number; onChanged: () => Promise<unknown>;
  onOpenItem: (item: ReviewItem, reschedule: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("pending");
  const [data, setData] = useState<Review | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [detailItem, setDetailItem] = useState<ReviewItem | null>(null);
  const [history, setHistory] = useState<CampaignPostActivityResponse | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const generation = useRef(0);
  const detailGeneration = useRef(0);
  const mutating = useRef(false);
  useEffect(() => () => { generation.current++; detailGeneration.current++; }, []);

  async function read(nextView = view, page = 1) {
    const version = ++generation.current;
    setLoading(true); setData(null); setSelected([]); setError(""); setView(nextView);
    try {
      const response = await fetch(`/api/queue/paused-review?view=${nextView}&page=${page}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível atualizar a revisão. Consulte novamente antes de agir.");
      const result: unknown = await response.json();
      if (!validReview(result)) throw new Error("Resposta inválida");
      if (version === generation.current) setData(result);
    } catch {
      if (version === generation.current) setError("Não foi possível atualizar a revisão. Consulte novamente antes de agir.");
    } finally { if (version === generation.current) setLoading(false); }
  }
  function show(nextView: View) { setOpen(true); setNotice(""); void read(nextView); }
  function close() { generation.current++; setOpen(false); setData(null); setSelected([]); setConfirm(false); setLoading(false); }
  function closeDetail() { detailGeneration.current++; setDetailItem(null); setHistory(null); setDetailLoading(false); }
  async function details(item: ReviewItem, reschedule = false) {
    const version = ++detailGeneration.current;
    setDetailItem(item); setHistory(null); setDetailError(""); setDetailLoading(true);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(item.campaignId)}/activity?postId=${encodeURIComponent(item.id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Histórico indisponível");
      const result: unknown = await response.json();
      if (!validHistory(result, item.id)) throw new Error("Histórico inválido");
      if (version !== detailGeneration.current) return;
      if (reschedule && result.post.status === "paused" && item.canReschedule) {
        closeDetail(); onOpenItem({ ...item, ...result.post, lastError: result.post.lastError || "Nenhum motivo histórico registrado." }, true);
      } else setHistory(result);
    } catch { if (version === detailGeneration.current) setDetailError("Não foi possível consultar o histórico atual. Tente novamente."); }
    finally { if (version === detailGeneration.current) setDetailLoading(false); }
  }
  const selection = data?.items.filter(item => selected.includes(item.id) && item.canCancel) || [];
  async function cancel() {
    if (!canOperate || !selection.length || mutating.current || loading) return;
    mutating.current = true;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/queue/paused-review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cancel", confirmation: "CANCELAR", items: selection.map(({ id, snapshot }) => ({ id, snapshot })) }) });
      if (!response.ok) throw new Error("Resultado não confirmado");
      const result: unknown = await response.json();
      if (!validResult(result, selection.length)) throw new Error("Resultado inválido");
      setNotice(`${result.cancelled} cancelada(s); ${result.unchanged} não alterada(s); ${result.unknown} resultado(s) não confirmado(s).${result.unknown ? " Não repita a ação sem conferir o estado atual." : ""}${result.warnings?.length ? " A auditoria não pôde ser confirmada. Confira o estado atual." : ""}`);
    } catch {
      setNotice("Não foi possível confirmar o resultado. A operação pode ter sido gravada. Confira a consulta atual antes de selecionar novamente; nenhum envio será iniciado aqui.");
    } finally {
      setConfirm(false); setSelected([]);
      // A failed refresh leaves data null and actions unavailable, including after reopening.
      await read(view);
      try { await onChanged(); } catch { setNotice(previous => `${previous} Atualize também a lista principal da Fila.`); }
      setBusy(false);
      mutating.current = false;
    }
  }
  return <section className={`panel ${styles.panel}`} aria-label="Revisão de pausadas">
    <header className={styles.actions}>
      <button type="button" className="outline-button" aria-expanded={open} aria-controls="queue-paused-content" disabled={busy} onClick={() => open ? close() : show("pending")}>Revisar pausadas</button>
      <button type="button" className="outline-button" aria-pressed={open && view === "protected"} disabled={busy} onClick={() => show("protected")}>Em conferência ({data?.protectedTotal ?? protectedCount})</button>
    </header>
    <p>Envios ou recibos protegidos ficam em conferência, separados da fila operacional. Não serão reenviados automaticamente.</p>
    {open && <div id="queue-paused-content" aria-busy={loading || busy}>
      <div className={styles.actions}>
        <button type="button" className="text-button" aria-pressed={view === "pending"} disabled={busy} onClick={() => show("pending")}>Pendências para revisão</button>
        <button type="button" className="outline-button" disabled={busy || loading} onClick={() => void read(view, data?.page)}>Atualizar revisão</button>
        <button type="button" className="text-button" disabled={busy} onClick={close}>Recolher revisão</button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {loading && <p role="status">Consultando a situação atual…</p>}
      {error && <p role="alert">{error}</p>}
      {data && <>
        <p>{data.total} pausada(s) no workspace · {data.protectedTotal} em conferência · {data.eligibleTotal} elegível(is) para cancelamento.</p>
        {data.eligibleTotal === 0 && <p><strong>Nenhuma pendência elegível para cancelamento.</strong></p>}
        {view === "protected" && <p>Uma tentativa registrada não comprova publicação concluída. O motivo exato pode não ter sido salvo; os detalhes mostram apenas o histórico disponível. Esta revisão não resolve nem reenvia esses registros.</p>}
        {!data.items.length && <p>Nenhum item nesta seção.</p>}
        {canOperate && view === "pending" && <div className={styles.actions}>
          <button type="button" className="outline-button" disabled={busy || !data.items.some(item => item.canCancel)} onClick={() => setSelected(data.items.filter(item => item.canCancel).map(item => item.id))}>Selecionar elegíveis desta página</button>
          <button type="button" className="text-button" disabled={busy || !selected.length} onClick={() => setSelected([])}>Limpar seleção</button>
        </div>}
        {data.items.map(item => <article key={item.id} className={styles.item}>
          <div className={styles.title}>
            {canOperate && item.canCancel && <input type="checkbox" aria-label={`Selecionar ${item.username} — ${item.campaignName}`} checked={selected.includes(item.id)} disabled={busy} onChange={event => setSelected(previous => event.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))} />}
            <strong>@{item.username} · {item.campaignName}</strong>
          </div>
          <p>Campanha agora: <strong>{campaignStatus[item.campaignStatus || ""] || "Indisponível"}</strong> · Publicação: Pausada</p>
          <p><strong>{item.reason}.</strong> {item.instruction}</p>
          <details><summary>Motivo histórico da interrupção</summary><p>{item.lastError}</p></details>
          <div className={styles.actions}>
            <button type="button" className="outline-button" disabled={busy} onClick={() => void details(item)}>Abrir detalhes</button>
            {canOperate && item.canReschedule && <button type="button" className="outline-button" disabled={busy} onClick={() => void details(item, true)}>Reagendar pelo fluxo existente</button>}
          </div>
        </article>)}
        <div className={styles.actions}>
          <span>Página {data.page} de {Math.max(1, Math.ceil(data.viewTotal / data.pageSize))} · {data.items.length} de {data.viewTotal} itens nesta seção</span>
          <button type="button" className="outline-button" disabled={busy || data.page <= 1} onClick={() => void read(view, data.page - 1)}>Anterior</button>
          <button type="button" className="outline-button" disabled={busy || data.page * data.pageSize >= data.viewTotal} onClick={() => void read(view, data.page + 1)}>Próxima</button>
        </div>
        {canOperate && view === "pending" && <div className={styles.actions}>
          <span>{selection.length} selecionada(s) nesta página</span>
          <button id="queue-review-cancel" type="button" className="outline-button" disabled={busy || !selection.length} onClick={() => setConfirm(true)}>Revisar cancelamento</button>
        </div>}
      </>}
    </div>}
    {detailItem && <CampaignDialog titleId="queue-review-detail-title" className={styles.dialog} onClose={closeDetail}>
      <h2 id="queue-review-detail-title">Detalhes da publicação</h2>
      <p>@{detailItem.username} · {detailItem.campaignName}</p>
      {detailItem.reviewProtected && <p>Em conferência. Não será reenviada automaticamente. Os eventos abaixo não permitem inferir o resultado de um envio sem confirmação.</p>}
      {detailLoading && <p role="status">Consultando histórico…</p>}
      {detailError && <p role="alert">{detailError}</p>}
      {history && <>
        <p>Estado registrado: {history.post.status === "paused" ? "Pausada" : history.post.status} · Tentativas: {history.post.attemptCount}/{history.post.maxAttempts}</p>
        <p>Agendada para: {new Date(history.post.scheduledFor).toLocaleString("pt-BR")}</p>
        <p>{history.post.lastError || "Nenhum motivo histórico registrado."}</p>
        <p>Últimos 30 eventos, no máximo. {history.hasMoreAttempts ? "Há eventos anteriores fora desta consulta." : "Todos os eventos disponíveis estão abaixo."}</p>
        {!history.attempts.length && <p>Nenhum evento registrado.</p>}
        <ol>{history.attempts.map(attempt => <li key={attempt.id}>
          <p><strong>{attempt.stage} · {attempt.outcome}</strong> · {new Date(attempt.createdAt).toLocaleString("pt-BR")}</p>
          <p>{attempt.message || "Evento sem mensagem registrada."}</p>
        </li>)}</ol>
      </>}
      <div className={styles.actions}>
        <button type="button" className="outline-button" disabled={detailLoading} onClick={() => void details(detailItem)}>Atualizar histórico</button>
        <button type="button" className="outline-button" onClick={closeDetail}>Fechar detalhes</button>
      </div>
    </CampaignDialog>}
    {confirm && <CampaignDialog titleId="queue-review-title" descriptionId="queue-review-effect" className={styles.dialog} busy={busy} onClose={() => setConfirm(false)} returnFocusFallbackId="queue-review-cancel">
      <h2 id="queue-review-title">Cancelar {selection.length} pendência(s)?</h2>
      <p id="queue-review-effect">As selecionadas sairão da fila ativa. O motivo original, as tentativas e o histórico serão preservados. Nenhuma campanha será reativada e nenhuma publicação será enviada. Se a situação mudou, o item não será cancelado.</p>
      <ul>{selection.map(item => <li key={item.id}>@{item.username} · {item.campaignName}</li>)}</ul>
      <div className={styles.actions}>
        <button type="button" className="outline-button" disabled={busy} onClick={() => setConfirm(false)}>Voltar sem cancelar</button>
        <button type="button" className="primary-button" disabled={busy} onClick={() => void cancel()}>{busy ? "Conferindo resultado…" : "Confirmar cancelamento"}</button>
      </div>
    </CampaignDialog>}
  </section>;
}
