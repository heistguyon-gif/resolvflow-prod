"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { Stage, Usage, Delivery } from "../../lib/measurement/model";
import type { TelemetryStage } from "../../lib/measurement/telemetry";
import { emptyFilters, type Filters, type adminMeasurementReport } from "../../lib/measurement/report";
import styles from "./Measurement.module.css";

export type MeasurementReport = ReturnType<typeof adminMeasurementReport>;
const stages: Record<Stage, string> = {page_view:"Visita",view_content:"Conteúdo visto",demo_progress:"Etapa da demo",
  lead_registered:"Cadastro gravado",checkout_started:"Checkout iniciado",purchase_confirmed:"Pagamento confirmado"};
const telemetryStages: Record<TelemetryStage, string> = {
  entry:"Entrada",hero:"Hero",demo:"Demo",offer:"Propostas",checkout:"Checkout",faq:"FAQ",closing:"Fechamento",
};
const actions: Record<Usage, string> = {
  signed_in:"Login",workspace_opened:"Workspace",campaigns_opened:"Campanhas",stories_opened:"Stories",mail_reader_opened:"Leitor de e-mails",
};
const deliveryLabels: Record<Delivery, string> = {accepted:"Aceitas pela Meta",rejected:"Rejeitadas",uncertain:"Resultado incerto",
  suppressed:"Não enviadas",claimed:"Sem recibo final"};
const sources = [["meta","Meta"],["search","Busca"],["partner","Parceiro"],["direct","Direto"],["other","Outras"]];

function formatMs(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

export function MeasurementDashboard({initial, apply}: {
  initial?: MeasurementReport;
  apply?: (filters: Filters) => MeasurementReport;
}) {
  const [metrics, setMetrics] = useState(initial);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [active, setActive] = useState<Filters>(emptyFilters);
  const [state, setState] = useState<"idle"|"loading"|"error">(initial ? "idle" : "loading");

  useEffect(() => {
    if (apply) return;
    const controller = new AbortController();
    fetch("/api/admin/measurement?" + new URLSearchParams(active).toString(), {signal: controller.signal})
      .then(response => { if (!response.ok) throw Error("unavailable"); return response.json() as Promise<MeasurementReport>; })
      .then(value => {if (!controller.signal.aborted) {setMetrics(value);setState("idle");}})
      .catch(() => {if (!controller.signal.aborted) {setMetrics(undefined);setState("error");}});
    return () => controller.abort();
  }, [active, apply]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (apply) setMetrics(apply(filters));
    else {setState("loading");setActive({...filters});}
  }
  const campaignOptions = Array.from(new Set([filters.campaign, ...(metrics?.availableCampaigns ?? [])])).filter(Boolean);
  function select(key: keyof Filters, label: string, options: [string,string][]) {
    return <label>{label}<select value={filters[key]} onChange={e => setFilters({...filters,[key]:e.target.value})}>
      <option value="">Todos</option>
      {options.map(([value,text]) => <option key={value} value={value}>{text}</option>)}
    </select></label>;
  }
  return <main className={styles.shell}>
    <p className={styles.eyebrow}>ResolvFlow · Administração</p>
    <h1>Aquisição e uso</h1>
    {metrics?.mode === "fixture" && <p className={styles.callout}>O funil consentido abaixo ainda usa demonstração sintética. O bloco privado de /planos usa o R2 real quando houver telemetria.</p>}
    {metrics?.mode === "stored" && <p>Fonte: eventos próprios de /planos e sinais autenticados deste workspace.</p>}
    {metrics?.telemetry?.mode === "stored" && <p>Telemetria privada: leads, cliques e tempo por etapa gravados em R2 a partir de /planos.</p>}
    {metrics?.telemetry?.mode === "empty" && <p className={styles.muted}>Ainda não há leads/cliques privados no R2 para este painel.</p>}
    <form className={styles.filters} onSubmit={submit}>
      <label>De (UTC)<input type="date" value={filters.from} onChange={e => setFilters({...filters,from:e.target.value})}/></label>
      <label>Até (UTC)<input type="date" min={filters.from || undefined} value={filters.to} onChange={e => setFilters({...filters,to:e.target.value})}/></label>
      {select("source","Origem",sources as [string,string][])}
      {select("campaign","Campanha",campaignOptions.map(value => [value,value]))}
      {select("landing","Landing",[["planos","/planos"]])}
      {select("stage","Etapa",Object.entries(stages))}
      {select("plan","Plano",(metrics?.plans ?? []).map(value => [value,value.replaceAll("-"," ")]))}
      <button type="submit" disabled={state==="loading"}>Aplicar filtros</button>
    </form>
    {state === "loading" && <p role="status">Carregando medição…</p>}
    {state === "error" && <p role="alert">Não foi possível carregar a medição. Aplique os filtros para tentar novamente.</p>}
    {metrics && state === "idle" && <>
      {!metrics.complete && <p role="status" className={styles.callout}>A leitura atingiu o limite da consulta. Os totais são parciais e as taxas estão ocultas.</p>}
      <section className={styles.card}>
        <h2>Funil consentido</h2>
        <p>Base: {metrics.denominator} jornadas distintas com visita e consentimento analítico no recorte. Taxa por etapa considera só as jornadas dessa base. Filtro de plano omite taxa.</p>
        <div className={styles.rows}>
          {metrics.rows.map(row => <div key={row.stage}><strong>{stages[row.stage]}</strong><span>{row.events === null ? "Etapa sem fonte de medição" : `${row.events} eventos · ${row.journeys} jornadas`}</span>
            <span>{row.rate === null ? "—" : new Intl.NumberFormat("pt-BR",{style:"percent",maximumFractionDigits:1}).format(row.rate)}</span></div>)}
        </div>
        {!metrics.rows.some(row => row.events) && <p>Nenhum evento corresponde aos filtros.</p>}
      </section>
      <section className={styles.card}>
        <h2>Entregas ao servidor da Meta</h2>
        <dl className={styles.grid}>
          {Object.entries(metrics.delivery).map(([key,count]) => <div key={key}><dt>{deliveryLabels[key as Delivery]}</dt><dd>{count}</dd></div>)}
          <div><dt>IDs com duplicata suprimida</dt><dd>{metrics.duplicates}</dd></div>
        </dl>
        <p>A aceitação do servidor não atesta entrega do Pixel nem atribuição no Gerenciador de Anúncios.</p>
      </section>
      <section className={styles.card}>
        <h2>Uso do workspace</h2>
        <p>Contagem por pseudônimo diário e ação. Aqui se aplica somente o período.</p>
        <dl className={styles.grid}>{metrics.usage.map(row => <div key={row.usage}><dt>{actions[row.usage]}</dt><dd>{row.dailySubjects}</dd></div>)}</dl>
        <p>Gasto, CPM e ROAS indisponíveis. Exigem acesso separado ao Insights da conta de anúncios.</p>
      </section>
      {metrics.telemetry && <section className={styles.card}>
        <h2>Funil privado de /planos</h2>
        <p>Lead na entrada, mapa de calor e permanência por etapa. Independente do Pixel e do funil consentido acima.</p>
        {!metrics.telemetry.complete && <p role="status" className={styles.callout}>Leitura parcial do R2: totais de telemetria podem estar incompletos.</p>}
        <dl className={styles.grid}>
          <div><dt>Leads na entrada</dt><dd>{metrics.telemetry.leads}</dd></div>
          <div><dt>Jornadas com lead</dt><dd>{metrics.telemetry.leadJourneys}</dd></div>
          <div><dt>Cliques registrados</dt><dd>{metrics.telemetry.clicks}</dd></div>
        </dl>
        <h3 className={styles.subheading}>Tempo por etapa</h3>
        <div className={styles.rows}>
          {metrics.telemetry.stageRows.map(row => <div key={row.stage}>
            <strong>{telemetryStages[row.stage]}</strong>
            <span>{row.samples} amostras · {row.journeys} jornadas</span>
            <span>{row.samples ? `média ${formatMs(row.avgDwellMs)}` : "—"}</span>
          </div>)}
        </div>
        <h3 className={styles.subheading}>Mapa de calor</h3>
        {metrics.telemetry.clicks === 0 ? <p>Nenhum clique no recorte.</p> : <>
          <div className={styles.heat} role="img" aria-label="Mapa de calor dos cliques em /planos">
            {metrics.telemetry.heat.cells.flatMap((row, y) => row.map((count, x) => {
              const intensity = metrics.telemetry!.heat.max ? count / metrics.telemetry!.heat.max : 0;
              return <span key={`${x}-${y}`} title={`${count} clique(s) · célula ${x + 1},${y + 1}`} style={{
                background: count ? `rgba(255, 173, 117, ${0.12 + intensity * 0.88})` : "#221f1b",
              }}/>;
            }))}
          </div>
          <p className={styles.muted}>Grade 20×20 sobre a página; células mais claras tiveram mais cliques no recorte.</p>
        </>}
        <h3 className={styles.subheading}>Onde mais clicam</h3>
        {metrics.telemetry.topTargets.length === 0 ? <p>Sem alvos agregados no recorte.</p> : (
          <div className={styles.rows}>
            {metrics.telemetry.topTargets.map(row => <div key={row.target}>
              <strong>{row.target}</strong>
              <span>{row.count} clique(s)</span>
              <span/>
            </div>)}
          </div>
        )}
      </section>}
    </>}
  </main>;
}
