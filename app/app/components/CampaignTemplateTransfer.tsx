"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./CampaignTemplateTransfer.module.css";

type Template = { id: string; name: string; mediaCount: number; mediaType: string };
type Destination = { ownerUserId: string; name: string; email: string; workspaceName: string };
type Selection = { template: Template; destination: Destination; requestId: string };
type Options = { templates: Template[]; destinations: Destination[] };
const ENDPOINT = "/api/admin/campaign-template-transfers";

function intentKey(source: string, target: string) { return `template-transfer:${source}:${target}`; }
function requestIdFor(source: string, target: string) {
  const key = intentKey(source, target);
  try { const saved = sessionStorage.getItem(key); if (saved) return saved; } catch { /* in-memory retry still works */ }
  const id = crypto.randomUUID();
  try { sessionStorage.setItem(key, id); } catch { /* private storage may be unavailable */ }
  return id;
}

export function CampaignTemplateTransfer() {
  const [options, setOptions] = useState<Options | null>(null);
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [review, setReview] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const sending = useRef(false);
  const active = useRef(true);

  async function load(signal?: AbortSignal) {
    setLoading(true); setError("");
    try {
      const response = await fetch(ENDPOINT, { credentials: "same-origin", cache: "no-store", signal });
      if (response.status === 401 || response.status === 403) { if (active.current) setHidden(true); return; }
      const body = await response.json() as Options & { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível carregar os templates.");
      if (!Array.isArray(body.templates) || !Array.isArray(body.destinations)) throw new Error("Não foi possível carregar as opções. Atualize a lista.");
      if (active.current) { setOptions(body); setHidden(false); }
    } catch (failure) {
      if (signal?.aborted || !active.current) return;
      // The existing library remains usable when this optional owner-only panel cannot load.
      setError(failure instanceof Error ? failure.message : "Não foi possível carregar os templates.");
    } finally { if (active.current) setLoading(false); }
  }
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void load(controller.signal); }, 0);
    return () => { active.current = false; window.clearTimeout(timer); controller.abort(); };
  }, []);

  async function send() {
    if (!review || sending.current) return;
    sending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(ENDPOINT, { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceCampaignId: review.template.id, targetOwnerUserId: review.destination.ownerUserId, requestId: review.requestId }) });
      const body = await response.json() as { error?: string; template?: { id: string } };
      if (!response.ok) throw new Error(body.error || "Não foi possível confirmar o envio. Tente novamente com esta seleção.");
      if (body.template?.id !== review.requestId) throw new Error("Não foi possível confirmar o envio. Tente novamente com esta seleção.");
      try { sessionStorage.removeItem(intentKey(review.template.id, review.destination.ownerUserId)); } catch { /* preserve successful server result */ }
      if (!active.current) return;
      setMessage(`“${review.template.name}” está disponível nos templates de ${review.destination.email}. Nessa conta, abra Nova campanha e escolha o template.`);
      setReview(null); setSource(""); setTarget("");
    } catch (failure) {
      if (active.current) setError(failure instanceof Error ? failure.message : "Não foi possível confirmar o envio. Tente novamente com esta seleção.");
    } finally { sending.current = false; if (active.current) setBusy(false); }
  }
  if (hidden) return null;
  return <details className={`panel ${styles.panel}`}>
    <summary><strong>Enviar template para outra conta</strong><span>Reutilize seus vídeos, capas e legendas</span></summary>
    <div className={styles.content}>
      <p>Envie uma cópia do seu template. A conta de destino poderá usá-la em uma nova campanha.</p>
      {message && <p className={styles.success} role="status">{message}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {review ? <section className={styles.review} aria-label="Revisar envio de template">
        <h3>Conferir envio</h3>
        <dl><dt>Template</dt><dd>{review.template.name} · {review.template.mediaCount} arquivo(s)</dd>
          <dt>Conta de destino</dt><dd>{review.destination.name} · {review.destination.email}<small>{review.destination.workspaceName}</small></dd></dl>
        <p>Vídeos, capas, legendas e configurações serão copiados. A conta de destino escolhe os perfis e os horários antes de publicar.</p>
        <div className={styles.actions}>
          <button type="button" className="primary-button" disabled={busy} onClick={() => void send()}>{busy ? "Enviando…" : "Confirmar envio"}</button>
          <button type="button" className={styles.secondary} disabled={busy} onClick={() => { setReview(null); setError(""); }}>Voltar</button>
        </div>
      </section> : <form onSubmit={(event) => {
        event.preventDefault();
        const template = options?.templates.find((item) => item.id === source);
        const destination = options?.destinations.find((item) => item.ownerUserId === target);
        if (template && destination) { setReview({ template, destination, requestId: requestIdFor(template.id, destination.ownerUserId) }); setError(""); setMessage(""); }
      }}>
        <div className={styles.fields}>
          <label>Seu template<select required value={source} disabled={loading} onChange={(event) => setSource(event.target.value)}>
            <option value="">Escolha um template</option>
            {options?.templates.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.mediaCount} arquivo(s)</option>)}
          </select></label>
          <label>Conta de destino<select required value={target} disabled={loading} onChange={(event) => setTarget(event.target.value)}>
            <option value="">Escolha quem receberá a cópia</option>
            {options?.destinations.map((item) => <option key={`${item.ownerUserId}:${item.email}`} value={item.ownerUserId}>{item.name} · {item.email} · {item.workspaceName}</option>)}
          </select></label>
        </div>
        {!loading && !options?.templates.length && <p>Você ainda não tem templates salvos. Salve uma campanha como template para enviá-la.</p>}
        {!loading && !options?.destinations.length && <p>Nenhuma conta de destino ativa disponível.</p>}
        <div className={styles.actions}><button type="submit" className="primary-button" disabled={loading || !source || !target}>Revisar envio</button>
          <button type="button" className={styles.secondary} disabled={loading} onClick={() => void load()}>{loading ? "Atualizando…" : "Atualizar lista"}</button></div>
      </form>}
    </div>
  </details>;
}
