"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CrmDocument, CrmFields } from "../../lib/owner-crm";
import { CRM_LIMITS, crmFields, crmTotals } from "../../lib/owner-crm";
import { calculateCrmMetrics, type CrmMetrics } from "../../lib/owner-crm-metrics";
import type { CrmExchange } from "../../lib/crm-exchange";
import styles from "./OwnerUserCrm.module.css";

export type OwnerUserCrmProps = { userId: string; from: string; to: string };
type Snapshot = {
  userId: string; crm: CrmDocument; totals: ReturnType<typeof crmTotals>;
  period: { from: string; to: string }; metrics: CrmMetrics; exchange: CrmExchange | null;
};
type PaymentDraft = { id: string; amount: string; date: string; note: string };
type Draft = { modality: string; access: string; percent: string; cost: string; notes: string; payments: PaymentDraft[] };
const brl = (cents: number | null) => cents === null ? "Não definido" : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const usd = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 4 });
const dateLabel = (value: string) => new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" });
const draftFrom = (crm: CrmDocument): Draft => ({
  modality: crm.modality, access: crm.accessAmountCents === null ? "" : (crm.accessAmountCents / 100).toFixed(2),
  percent: crm.operationPercent === null ? "" : String(crm.operationPercent), cost: String(crm.gmailCostUsd), notes: crm.notes,
  payments: crm.payments.map(payment => ({ id: payment.id, amount: (payment.amountCents / 100).toFixed(2), date: payment.date, note: payment.note })),
});
function decimalInput(value: string, places: number, label: string) {
  if (!new RegExp(`^\\d+(?:[.,]\\d{1,${places}})?$`).test(value.trim())) throw new Error(`${label}: informe um número com até ${places} casas decimais.`);
  return Number(value.trim().replace(",", "."));
}
function fieldsFrom(draft: Draft): CrmFields {
  return crmFields({
    modality: draft.modality, accessAmountCents: draft.access.trim() ? Math.round(decimalInput(draft.access, 2, "Valor combinado") * 100) : null,
    operationPercent: draft.percent.trim() ? decimalInput(draft.percent, 2, "Percentual") : null,
    gmailCostUsd: decimalInput(draft.cost, 4, "Custo por Gmail"), notes: draft.notes,
    payments: draft.payments.map(payment => ({ id: payment.id, amountCents: Math.round(decimalInput(payment.amount, 2, "Pagamento") * 100), date: payment.date, note: payment.note })),
  });
}
async function readResponse(response: Response) {
  const body = await response.json().catch(() => null) as (Snapshot & { error?: string }) | null;
  if (!response.ok) throw Object.assign(new Error(body?.error || "Não foi possível acessar o CRM."), { status: response.status });
  if (!body?.crm || !body.userId) throw new Error("Resposta do CRM inválida.");
  return body;
}

function Summary({ data, compact = false }: { data: Snapshot; compact?: boolean }) {
  const { crm, totals, metrics: m, exchange, period } = data;
  return <div className={styles.summary}>
    <div className={styles.heading}><div><span className={styles.eyebrow}>Privado · proprietário</span><h3>{compact ? "Comercial e Gmail" : "Resultado estimado de Gmail"}</h3></div><span className={styles.badge}>Estimativa</span></div>
    {compact ? <><p>{crm.modality || "Acordo comercial ainda não registrado."}</p><dl className={styles.metrics}>
      <div><dt>Acesso combinado</dt><dd>{brl(crm.accessAmountCents)}</dd></div>
      <div><dt>Recebido registrado · todo o histórico</dt><dd>{brl(totals.receivedCents)}</dd></div>
      <div><dt>Saldo pendente do acordo</dt><dd>{brl(totals.pendingCents)}</dd></div>
    </dl></> : null}
    <p>Atividade de {dateLabel(period.from)} a {dateLabel(period.to)} · todos os workspaces deste usuário.</p>
    <dl className={styles.metrics}>
      <div><dt>Cobrança líquida</dt><dd>{brl(m.netChargesCents)}<small>{brl(m.chargesCents)} cobrados − {brl(m.refundsCents)} em estornos</small></dd></div>
      <div><dt>Depósitos PIX · separados</dt><dd>{brl(m.depositsCents)}<small>Recargas de carteira, não receita</small></dd></div>
      <div><dt>Gmails gerados</dt><dd>{m.gmailCount.toLocaleString("pt-BR")}<small>{m.commercialGmailCount} na estimativa · {m.excludedGmailCount} excluídos</small></dd></div>
      <div><dt>Códigos recebidos</dt><dd>{m.codesReceived.toLocaleString("pt-BR")}<small>Não multiplicam o custo</small></dd></div>
      <div><dt>Custo estimado USD</dt><dd>{usd(m.estimatedCostUsd)}<small>{m.commercialGmailCount} Gmails × {usd(crm.gmailCostUsd)}/Gmail</small></dd></div>
      <div className={styles.result}><dt>Resultado estimado BRL</dt><dd>{m.estimatedResultBrlCents === null ? "Cotação indisponível" : brl(m.estimatedResultBrlCents)}<small>Cobrança líquida − custo estimado {m.estimatedCostBrlCents === null ? "(conversão pendente)" : brl(m.estimatedCostBrlCents)}</small></dd></div>
    </dl>
    <p className={styles.quote}>{exchange ? <>US$ 1 = {exchange.brlPerUsd.toLocaleString("pt-BR", { maximumFractionDigits: 6 })} BRL · cotação de {new Date(exchange.updatedAt).toLocaleString("pt-BR", { timeZone: "UTC" })} UTC · <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">ExchangeRate-API</a>. Cotação atual, não histórica.</> : "Não foi possível obter uma cotação válida. O custo USD permanece visível; nenhum valor BRL foi presumido."}</p>
    <details className={styles.limits}><summary>Base de cálculo e limitações</summary><p>Gmails são contados uma vez por pedido/origem; códigos com data são contados separadamente. {m.ownApiGmailCount} Gmails têm origem em API própria. Pedidos próprios sem faturamento identificado e pedidos identificados como sem cobrança ficam fora do custo comercial.</p><p>Nos registros antigos, a origem da plataforma é usada como aproximação: nem toda cobrança tem vínculo com um Gmail. APIs excluídas ou origens antigas podem tornar essa classificação incompleta. Cobranças e estornos seguem a data do lançamento; Gmails, a criação; códigos, o recebimento. Isso pode produzir diferenças entre períodos.</p><p>Não representa lucro real: não inclui taxas, impostos, despesas operacionais ou custos efetivos de fornecedores. Acordo, percentual e pagamentos manuais não entram neste resultado. Depósitos não são receita. Nenhuma estimativa altera a contabilidade.</p></details>
  </div>;
}

function Editor({ data, onSaved, onReload }: { data: Snapshot; onSaved: (crm: CrmDocument) => void; onReload: () => void }) {
  const [saved, setSaved] = useState(data.crm);
  const [draft, setDraft] = useState(() => draftFrom(data.crm));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const id = useId();
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFrom(saved));
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft(current => ({ ...current, [key]: value })); setMessage(""); };
  const editPayment = (paymentId: string, changes: Partial<PaymentDraft>) => update("payments", draft.payments.map(payment => payment.id === paymentId ? { ...payment, ...changes } : payment));
  let totals: ReturnType<typeof crmTotals> | null = null;
  try {
    const fields = fieldsFrom({ ...draft, cost: draft.cost || "0" });
    totals = crmTotals(fields);
  } catch { /* Keep incomplete drafts editable; validation is shown on save. */ }
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busyRef.current || conflict) return;
    setError(""); setMessage("");
    let fields: CrmFields;
    try { fields = fieldsFrom(draft); } catch (error) { setError(error instanceof Error ? error.message : "Revise os valores."); return; }
    busyRef.current = true;
    setBusy(true);
    try {
      const body = await readResponse(await fetch("/api/admin/users/crm", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: data.userId, revision: saved.revision, fields }) }));
      if (body.userId !== data.userId) throw new Error("Resposta de outro usuário recusada.");
      setSaved(body.crm); setDraft(draftFrom(body.crm)); onSaved(body.crm); setMessage("CRM salvo. Os dados comerciais não alteram a carteira.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Falha ao salvar. Seu rascunho foi preservado.");
      if (error && typeof error === "object" && "status" in error && error.status === 409) setConflict(true);
    } finally { busyRef.current = false; setBusy(false); }
  }
  return <form className={styles.editor} onSubmit={save}>
    <div className={styles.heading}><div><span className={styles.eyebrow}>Registro interno</span><h3>Acordo comercial</h3></div><small>{saved.updatedAt ? `Salvo em ${new Date(saved.updatedAt).toLocaleString("pt-BR")}` : "Ainda não registrado"}</small></div>
    <p>Campos comerciais começam vazios. O percentual é apenas uma anotação; não gera cálculo nem cobrança.</p>
    <fieldset disabled={busy} className={styles.fields}>
      <legend className={styles.srOnly}>Editar acordo comercial</legend>
      <label className={styles.full}>Modalidade do acordo<input maxLength={200} value={draft.modality} onChange={event => update("modality", event.target.value)} placeholder="Ex.: antecipado ou adiado conforme vendas" /></label>
      <label>Valor de acesso combinado (BRL)<input inputMode="decimal" maxLength={16} value={draft.access} onChange={event => update("access", event.target.value)} placeholder="Não definido" /><small>Máximo R$ 1.000.000,00</small></label>
      <label>Operação (%) · apenas anotação<input inputMode="decimal" maxLength={6} value={draft.percent} onChange={event => update("percent", event.target.value)} placeholder="Não definido" /><small>0 a 100%, sem cálculo automático</small></label>
      <label className={styles.full}>Custo médio estimado (USD por Gmail)<input inputMode="decimal" maxLength={10} value={draft.cost} onChange={event => update("cost", event.target.value)} aria-describedby={`${id}-cost`} required /><small id={`${id}-cost`}>Estimativa por Gmail gerado, não por código. Inicial: US$ 0,15; editável de US$ 0 a US$ 1.000, até 4 casas decimais. Salve para atualizar o resultado.</small></label>
      <div className={styles.full}>
        <div className={styles.heading}><h4>Pagamentos manuais ({draft.payments.length}/{CRM_LIMITS.payments})</h4><button type="button" disabled={draft.payments.length >= CRM_LIMITS.payments} onClick={() => update("payments", [...draft.payments, { id: crypto.randomUUID(), amount: "", date: "", note: "" }])}>Adicionar pagamento</button></div>
        <p>Registros do acordo, separados de PIX e carteira. Incluem todo o histórico, independentemente do período do Gmail.</p>
        {!draft.payments.length ? <p className={styles.empty}>Nenhum pagamento manual registrado.</p> : null}
        <div className={styles.payments}>{draft.payments.map((payment, index) => <fieldset key={payment.id} className={styles.payment}>
          <legend>Pagamento {index + 1}</legend>
          <label>Valor (BRL)<input inputMode="decimal" value={payment.amount} maxLength={16} onChange={event => editPayment(payment.id, { amount: event.target.value })} required /></label>
          <label>Data<input type="date" min="2000-01-01" max="2100-12-31" value={payment.date} onChange={event => editPayment(payment.id, { date: event.target.value })} required /></label>
          <label className={styles.paymentNote}>Nota do pagamento<textarea rows={2} maxLength={500} value={payment.note} onChange={event => editPayment(payment.id, { note: event.target.value })} /></label>
          <button className={styles.remove} type="button" aria-label={`Remover pagamento ${index + 1}`} onClick={() => update("payments", draft.payments.filter(item => item.id !== payment.id))}>Remover</button>
        </fieldset>)}</div>
        <dl className={styles.totals} aria-live="polite"><div><dt>Recebido registrado</dt><dd>{totals ? brl(totals.receivedCents) : "Revise os valores"}</dd></div><div><dt>Saldo pendente</dt><dd>{totals ? brl(totals.pendingCents) : "—"}</dd></div>{totals?.excessCents ? <div><dt>Acima do combinado</dt><dd>{brl(totals.excessCents)}</dd></div> : null}</dl>
      </div>
      <label className={styles.full}>Notas internas<textarea rows={4} maxLength={10000} value={draft.notes} onChange={event => update("notes", event.target.value)} /><small>{draft.notes.length}/10.000 caracteres · visível apenas ao proprietário</small></label>
    </fieldset>
    {error ? <p role="alert" className={styles.error}>{error}{conflict ? " Seu rascunho permanece na tela para consulta. Copie o que precisar antes de recarregar." : ""}</p> : null}
    {message ? <p role="status" className={styles.success}>{message}</p> : null}
    <div className={styles.actions}><button className={styles.primary} type="submit" disabled={busy || conflict || !dirty}>{busy ? "Salvando…" : "Salvar CRM"}</button>
      {conflict ? <button type="button" disabled={busy} onClick={onReload}>Descartar rascunho e recarregar</button> : <button type="button" disabled={busy || !dirty} onClick={() => { setDraft(draftFrom(saved)); setError(""); }}>Desfazer alterações</button>}
      {dirty ? <small>Alterações não salvas. Salve antes de fechar ou trocar de usuário.</small> : null}
    </div>
  </form>;
}

function Panel({ userId, from, to, compact = false }: OwnerUserCrmProps & { compact?: boolean }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [editorVersion, setEditorVersion] = useState(0);
  const [loadedRange, setLoadedRange] = useState("");
  const range = `${from}|${to}`;
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ userId, from, to });
    async function load() {
      setLoading(true); setError("");
      try {
        const body: Snapshot = await readResponse(await fetch(`/api/admin/users/crm?${query}`, { cache: "no-store", signal: controller.signal }));
        if (controller.signal.aborted) return;
        if (body.userId !== userId || !body.metrics || !body.period) throw new Error("Resposta do CRM inválida.");
        setData(previous => previous && previous.crm.revision > body.crm.revision ? { ...body, crm: previous.crm, totals: previous.totals, metrics: calculateCrmMetrics(body.metrics, previous.crm.gmailCostUsd, body.exchange) } : body);
        setLoadedRange(`${from}|${to}`);
      } catch (error) { if (!controller.signal.aborted) { setError(error instanceof Error ? error.message : "Não foi possível carregar o CRM."); if (error && typeof error === "object" && "status" in error && [401, 403].includes(Number(error.status))) setData(null); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [userId, from, to, refresh]);
  function onSaved(crm: CrmDocument) {
    setData(previous => previous ? { ...previous, crm, totals: crmTotals(crm), metrics: calculateCrmMetrics(previous.metrics, crm.gmailCostUsd, previous.exchange) } : previous);
  }
  return <section className={styles.root} aria-label={compact ? "Resumo comercial privado" : "CRM privado do usuário"} aria-busy={loading}>
    {loading ? <p role="status">Carregando CRM e estimativas…</p> : null}
    {error ? <div className={styles.error} role="alert"><p>{error}</p><button type="button" onClick={() => setRefresh(value => value + 1)}>Tentar novamente</button></div> : null}
    {data && !compact ? <Editor key={editorVersion} data={data} onSaved={onSaved} onReload={() => { setData(null); setEditorVersion(value => value + 1); setRefresh(value => value + 1); }} /> : null}
    {data && loadedRange === range && !error ? <Summary data={data} compact={compact} /> : null}
    {data && !loading && !error ? <button className={styles.refresh} type="button" onClick={() => setRefresh(value => value + 1)}>Atualizar resumo e cotação</button> : null}
  </section>;
}

/** The parent must mount only for the platform owner. The API independently enforces this. */
export default function OwnerUserCrm(props: OwnerUserCrmProps) { return <Panel key={props.userId} {...props} />; }
export function OwnerUserCrmSummary(props: OwnerUserCrmProps) { return <Panel key={props.userId} {...props} compact />; }
