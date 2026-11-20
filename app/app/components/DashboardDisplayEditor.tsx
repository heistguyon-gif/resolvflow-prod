"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DISPLAY_METRICS, DISPLAY_SECTIONS, parseDashboardDisplay, parseDashboardDetails, type DashboardDisplay, type DashboardDetails, type DisplayMetric, type DisplaySection } from "../../lib/dashboard-display";
import styles from "./DashboardDisplayEditor.module.css";

type Metric = { label: string; value: string; note: string };
type Snapshot = { key: string; metrics: DashboardDisplay; details: DashboardDetails; revision: string | null; ready: boolean; error: string };
type ApiReply = { metrics: unknown; details?: unknown; revision: string | null; error?: string };
const empty = (key: string): Snapshot => ({ key, metrics: {}, details: {}, revision: null, ready: false, error: "" });

export function useDashboardDisplay({ enabled, workspace, scope, period, day }: { enabled: boolean; workspace: string; scope: string; period: string; day: string }) {
  const endpoint = `/api/dashboard/display?${new URLSearchParams({ scope, period, ...(period === "custom" ? { day } : {}) })}`;
  const key = enabled ? `${workspace}:${endpoint}` : "";
  const [state, setState] = useState<Snapshot>(() => empty(""));
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const aliveKey = useRef(key); aliveKey.current = key;
  const requestSequence = useRef({ value: 0 });
  const load = useCallback(async () => {
    if (!key) return;
    const sequence = ++requestSequence.current.value;
    setState(previous => ({ ...(previous.key === key ? previous : empty(key)), ready: false, error: "" }));
    try {
      const response = await fetch(endpoint, { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(15000) });
      const body = await response.json() as ApiReply;
      if (!response.ok) throw new Error(body.error || "Não foi possível carregar os valores.");
      const metrics = parseDashboardDisplay(body.metrics);
      if (aliveKey.current === key && sequence === requestSequence.current.value) setState({ key, metrics, details: parseDashboardDetails(body.details), revision: body.revision, ready: true, error: "" });
    } catch (error) {
      if (aliveKey.current === key && sequence === requestSequence.current.value) setState(previous => ({ ...previous, key, ready: false, error: error instanceof Error ? error.message : "Falha ao carregar." }));
    }
  }, [key, endpoint]);
  useEffect(() => {
    setOpen(false);
    void load();
    const pending = requestSequence.current;
    return () => { pending.value++; };
  }, [load]);
  useEffect(() => {
    if (!enabled) { setEditing(false); return; }
    const toggle = () => {
      delete document.documentElement.dataset.theme;
      try { localStorage.setItem("resolvflow_theme", "dark"); } catch { /* Theme still applies when browser storage is unavailable. */ }
      setEditing(!editing); setOpen(!editing);
      if (!editing) void load();
    };
    window.addEventListener("resolv-dashboard-editor-toggle", toggle);
    return () => window.removeEventListener("resolv-dashboard-editor-toggle", toggle);
  }, [enabled, editing, load]);
  useEffect(() => {
    if (!enabled) return;
    const button = document.querySelector(".theme-toggle-button");
    button?.setAttribute("aria-pressed", String(editing));
    button?.setAttribute("aria-label", editing ? "Desativar edição de valores" : "Ativar edição de valores");
  }, [enabled, editing]);
  const current = key && state.key === key ? state : empty(key);
  const save = async (metrics: DashboardDisplay, details: DashboardDetails) => {
    if (!key || !current.ready || busy) return;
    setBusy(true);
    try {
      const response = await fetch(endpoint, { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ metrics: parseDashboardDisplay(metrics), details: parseDashboardDetails(details), revision: current.revision }), signal: AbortSignal.timeout(15000) });
      const body = await response.json() as ApiReply;
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar.");
      if (aliveKey.current === key) { setState({ key, metrics: parseDashboardDisplay(body.metrics), details: parseDashboardDetails(body.details), revision: body.revision, ready: true, error: "" }); setOpen(false); }
    } catch (error) {
      if (aliveKey.current === key) setState(previous => ({ ...previous, error: error instanceof Error ? error.message : "Falha ao salvar." }));
      throw error;
    } finally { setBusy(false); }
  };
  const present = (id: DisplayMetric, metric: Metric) => {
    const override = current.metrics[id];
    if (!override) return metric;
    return { ...metric, value: override.value === undefined ? metric.value : id === "success" ? `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(override.value)}%` : ["views", "reach", "followers"].includes(id) ? new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(override.value) : String(override.value), note: override.note ?? (override.value === undefined ? metric.note : "Período selecionado") };
  };
  return { enabled: !!key, open: !!key && open, editing: !!key && editing, busy, ...current, active: Object.keys(current.metrics).length > 0 || Object.keys(current.details).length > 0, load, save, present, show: () => { setOpen(true); void load(); }, stop: () => { if (!busy) { setEditing(false); setOpen(false); } }, close: () => { if (!busy) setOpen(false); } };
}

export type DashboardDisplayController = ReturnType<typeof useDashboardDisplay>;

export function DashboardDisplayToolbar({ controller }: { controller: DashboardDisplayController }) {
  if (!controller.editing) return null;
  return <div className={styles.toolbar} role="region" aria-label="Edição privada"><span>Modo de edição · somente seu login</span><button type="button" className="outline-button" onClick={controller.show}>Editar valores</button><button type="button" className="text-button" onClick={controller.stop}>Sair da edição</button></div>;
}

type EditorRow = { id: string; [key: string]: unknown };
function localDateInput(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
}
type EditorProps = { controller: DashboardDisplayController; realMetrics: Record<DisplayMetric, Metric>; rows: Record<DisplaySection, EditorRow[]>; periodLabel: string };
export function DashboardDisplayEditor(props: EditorProps) {
  return props.controller.open ? <DashboardDisplayForm key={`${props.controller.key}:${props.controller.ready}:${props.controller.revision}`} {...props}/> : null;
}
function DashboardDisplayForm({ controller, realMetrics, rows, periodLabel }: EditorProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Record<string, { value: string; note: string }>>(() => Object.fromEntries(DISPLAY_METRICS.map(id => [id, { value: controller.metrics[id]?.value?.toString() ?? "", note: controller.metrics[id]?.note ?? "" }])));
  const [validation, setValidation] = useState("");
  const [section, setSection] = useState<"metrics" | DisplaySection>("metrics");
  const [selectedRow, setSelectedRow] = useState("");
  const [detailsDraft, setDetailsDraft] = useState<Record<string, Record<string, Record<string, string>>>>(() => Object.fromEntries(Object.entries(controller.details).map(([group, entries]) => [group, Object.fromEntries(Object.entries(entries).map(([id, values]) => [id, Object.fromEntries(Object.entries(values).map(([field, value]) => [field, field === "publishedAt" ? localDateInput(String(value)) : String(value)]))]))])));
  useEffect(() => {
    if (!controller.open) return;
    const opener = document.activeElement as HTMLElement | null;
    const node = dialog.current;
    node?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { node?.close(); document.body.style.overflow = overflow; if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, [controller.open]);
  if (!controller.open) return null;
  const submit = async (reset = false) => {
    setValidation("");
    try {
      const metrics: DashboardDisplay = {};
      if (!reset) for (const id of DISPLAY_METRICS) {
        const field = draft[id];
        if (!field) continue;
        const value = field.value.trim();
        if (value && !/^\d+(?:[.,]\d{1,2})?$/.test(value)) throw new Error(`Confira o valor de ${realMetrics[id].label}. Use números sem separador de milhar.`);
        if (value || field.note.trim()) metrics[id] = { ...(value ? { value: Number(value.replace(",", ".")) } : {}), ...(field.note.trim() ? { note: field.note.trim() } : {}) };
      }
      const details: DashboardDetails = {};
      if (!reset) for (const [group, entries] of Object.entries(detailsDraft)) {
        const definition = DISPLAY_SECTIONS[group as DisplaySection].fields as Record<string, readonly [string, string]>;
        const output: Record<string, Record<string, string | number>> = {};
        for (const [id, values] of Object.entries(entries)) {
          const row: Record<string, string | number> = {};
          for (const [field, raw] of Object.entries(values)) {
            const value = raw.trim(); if (!value) continue;
            const [label, kind] = definition[field];
            if (kind === "number" || kind === "percent") {
              if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) throw new Error(`Confira ${label}. Use números sem separador de milhar.`);
              row[field] = Number(value.replace(",", "."));
            } else row[field] = kind === "date" ? new Date(value).toISOString() : value;
          }
          if (Object.keys(row).length) output[id] = row;
        }
        details[group as DisplaySection] = output;
      }
      await controller.save(parseDashboardDisplay(metrics), parseDashboardDetails(details));
    } catch (error) { setValidation(error instanceof Error ? error.message : "Não foi possível salvar."); }
  };
  const sectionRows = section === "metrics" ? [] : rows[section];
  const row = sectionRows.find(item => item.id === selectedRow) ?? sectionRows[0];
  const fields = section === "metrics" ? {} : DISPLAY_SECTIONS[section].fields as Record<string, readonly [string, string]>;
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="dashboard-display-title" onCancel={event => { event.preventDefault(); controller.close(); }}>
    <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <header className={styles.header}><div><span className={styles.kicker}>Seu login · {periodLabel}</span><h2 id="dashboard-display-title">Editar valores</h2></div><button type="button" className="icon-button" aria-label="Fechar editor" disabled={controller.busy} onClick={controller.close}>✕</button></header>
      <p className={styles.description}>Personalize a exibição da dashboard, ranking e relatórios neste período. Fica salvo somente para seu login, no computador e no celular. Campos vazios usam os dados reais, que permanecem preservados. A ordem do ranking acompanha as publicações editadas.</p>
      <label className={styles.sectionLabel}>Área para editar<select aria-label="Área para editar" value={section} disabled={controller.busy} onChange={event => { setSection(event.target.value as typeof section); setSelectedRow(""); }}><option value="metrics">Dashboard · indicadores</option>{Object.entries(DISPLAY_SECTIONS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
      {controller.ready ? <fieldset className={styles.fields} disabled={controller.busy}>{section === "metrics" ? DISPLAY_METRICS.map(id => <div className={styles.row} key={id}>
        <label className={styles.valueLabel}>{realMetrics[id].label}<input aria-label={`Valor: ${realMetrics[id].label}`} inputMode={id === "success" ? "decimal" : "numeric"} autoComplete="off" maxLength={18} placeholder={`Real: ${realMetrics[id].value}`} value={draft[id]?.value ?? ""} onChange={event => setDraft(previous => ({ ...previous, [id]: { ...previous[id], value: event.target.value } }))}/></label>
        <label>Legenda <span className={styles.optional}>opcional</span><input aria-label={`Legenda: ${realMetrics[id].label}`} maxLength={160} placeholder={realMetrics[id].note} value={draft[id]?.note ?? ""} onChange={event => setDraft(previous => ({ ...previous, [id]: { ...previous[id], note: event.target.value } }))}/></label>
      </div>) : <>
        {section !== "reportTotals" && <label className={styles.sectionLabel}>Registro<select aria-label="Registro para editar" value={row?.id ?? ""} onChange={event => setSelectedRow(event.target.value)}>{sectionRows.map(item => <option key={item.id} value={item.id}>{String(item.name || item.username || item.campaignName || item.id)}{section === "reportMedia" ? ` · ${String(item.campaignName || "Publicação")} · ${String(item.publishedAt || "").slice(0, 16)}` : ""}</option>)}</select></label>}
        {row ? <div className={styles.detailFields}>{Object.entries(fields).map(([field, [label, kind]]) => <label key={field}>{label}<input aria-label={`Valor: ${label}`} type={kind === "date" ? "datetime-local" : "text"} inputMode={kind === "number" ? "numeric" : kind === "percent" ? "decimal" : "text"} maxLength={kind === "text" ? 160 : kind === "date" ? 40 : 18} placeholder={`Real: ${String(row[field] ?? "—")}`} value={detailsDraft[section]?.[row.id]?.[field] ?? ""} onChange={event => setDetailsDraft(previous => ({ ...previous, [section]: { ...previous[section], [row.id]: { ...previous[section]?.[row.id], [field]: event.target.value } } }))}/>{kind === "date" && <small>Horário local do seu dispositivo.</small>}</label>)}</div> : <p>Não há registros carregados nesta área. Abra a aba Relatórios para carregar suas contas e publicações.</p>}
      </>}</fieldset> : <p role="status">{controller.error ? "Os valores ainda não foram carregados." : "Carregando valores…"}</p>}
      {(validation || controller.error) && <p className={styles.error} role="alert">{validation || controller.error}</p>}
      {!controller.ready && controller.error && <button type="button" className="outline-button" onClick={() => void controller.load()}>Tentar novamente</button>}
      <footer className={styles.footer}><button type="button" className="outline-button" disabled={!controller.ready || controller.busy} onClick={() => void submit(true)}>Restaurar dados reais</button><button type="submit" className="primary-button" disabled={!controller.ready || controller.busy}>{controller.busy ? "Salvando…" : "Salvar alterações"}</button></footer>
    </form>
  </dialog>;
}
