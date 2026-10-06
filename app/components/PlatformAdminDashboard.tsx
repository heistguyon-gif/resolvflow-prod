"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./PlatformAdminDashboard.module.css";
import { SharkBotSaleNotifier } from "./SharkBotIntegration";
import { AdminUsersDirectory } from "./AdminUsersDirectory";
import { MetaAppsManager } from "./MetaAppsManager";
import { AdminOtpCenter } from "./AdminOtpCenter";
import { AdminWorkspaceView } from "./AdminWorkspaceView";
import { AdminAnalysisDashboard } from "./AdminAnalysisDashboard";

type View = "overview" | "users" | "workspace" | "metaapps" | "otp" | "infrastructure" | "sharkbot" | "activity";
type Period = "today" | "yesterday" | "7d" | "30d" | "custom" | "all";
type SharkEvent = { id:string;eventType:string;paymentId:string|null;status:string|null;amountCents:number;currency:string;payerName:string|null;productName:string|null;botName:string|null;flowName:string|null;gateway:string|null;occurredAt:string };
type SharkBreakdown = { botName:string|null;flowName:string|null;gateway:string|null;leads:number;created:number;approved:number;revenueCents:number };
type BillingSubscription = {name:string;planId:string|null;scope:string|null;sets:string[];state:string|null;frequency:string|null;periodStart:string|null;periodEnd:string|null;price:number;currency:string|null};
type CloudflareUsage = { checkedAt:string;source:string;retentionDays:number;resetAtUtc:string;benchmarks:{freeDaily:{rowsRead:number;rowsWritten:number;storageBytes:number};paidMonthlyIncluded:{rowsRead:number;rowsWritten:number;storageBytes:number}};today:{date:string;rowsRead:number;rowsWritten:number;readQueries:number;writeQueries:number};projectedToday:{rowsRead:number;rowsWritten:number;readQueries:number;writeQueries:number};rolling31:{rowsRead:number;rowsWritten:number;readQueries:number;writeQueries:number};storage:{bytes:number;primaryDatabaseBytes:number;databases:number;measuredAt:string|null;available:boolean};history:Array<{date:string;rowsRead:number;rowsWritten:number;readQueries:number;writeQueries:number}>;storageError:string|null;billing:{available:boolean;subscription:BillingSubscription|null;usage:{rowsRead:number;rowsWritten:number;readQueries:number;writeQueries:number};subscriptions:BillingSubscription[];error:string|null} };
type AdminData = { checkedAt:string; platform:Record<string,string>; totals:Record<string,number>; users:Array<{id:string;email:string;displayName:string;status:string;mustChangePassword:boolean;lastLoginAt:string|null;createdAt:string;isPlatformAdmin:boolean;memberships:Array<{role:string;status:string;workspaceName:string;workspaceOwnerUserId:string}>}>; ranking:Array<{ownerUserId:string;displayName:string;email:string|null;workspaceName:string;accounts:number;followers:number;published:number;views:number;reach:number}>; sharkbot:{configured:boolean;events:SharkEvent[];breakdown:SharkBreakdown[]}; health:Array<{key:string;status:string;lastCompletedAt:string|null;lastError:string|null;updatedAt:string}>; audit:Array<{id:string;actorEmail:string;action:string;summary:string;createdAt:string}> };

const nav:Array<{id:View;label:string;icon:string}> = [
  {id:"overview",label:"Visão geral",icon:"▦"},{id:"users",label:"Usuários",icon:"♙"},{id:"metaapps",label:"Apps Meta",icon:"◐"},{id:"otp",label:"Gmail OTP",icon:"✉"},{id:"infrastructure",label:"Uso Cloudflare",icon:"♢"},{id:"sharkbot",label:"Gateways",icon:""},{id:"activity",label:"Atividade",icon:"⌁"},
];
const periodNames:Record<Period,string> = {today:"Hoje",yesterday:"Ontem","7d":"Últimos 7 dias","30d":"Últimos 30 dias",custom:"Dia específico",all:"Todo o período"};
const nf = (v:number) => new Intl.NumberFormat("pt-BR").format(v||0);
const money = (v:number) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format((v||0)/100);
const bytes = (v:number) => {const units=["B","KB","MB","GB","TB"];let value=v||0,index=0;while(value>=1000&&index<units.length-1){value/=1000;index++}return `${value.toLocaleString("pt-BR",{maximumFractionDigits:index>1?2:0})} ${units[index]}`};
const percent = (used:number,limit:number) => limit ? Math.min(100,Math.max(0,used/limit*100)) : 0;
const formatDate = (v?:string|null) => v && !Number.isNaN(new Date(v).getTime()) ? new Date(v).toLocaleString("pt-BR") : "Nunca";
const dateInput = () => { const d=new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); };
function bounds(period:Period,custom:string){const now=new Date(),from=new Date(now),to=new Date(now);from.setHours(0,0,0,0);to.setHours(23,59,59,999);if(period==="yesterday"){from.setDate(from.getDate()-1);to.setDate(to.getDate()-1)}if(period==="7d")from.setDate(from.getDate()-6);if(period==="30d")from.setDate(from.getDate()-29);if(period==="custom"){const d=new Date(`${custom}T12:00:00`);from.setTime(d.getTime());to.setTime(d.getTime());from.setHours(0,0,0,0);to.setHours(23,59,59,999)}if(period==="all"){from.setFullYear(2000,0,1);to.setFullYear(2100,0,1)}return{from:from.toISOString(),to:to.toISOString()}}
function SearchIcon(){return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>}
function RefreshIcon(){return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20 11a8 8 0 1 0 2 5M20 4v7h-7"/></svg>}
function PaymentIcon(){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></svg>}
function Metric({title,value,note,icon,kind=""}:{title:string;value:string;note:string;icon:string;kind?:string}){return <article className={`metric-card ${kind==="accent"?"accent":""}`}><div className="metric-top"><span>{title}</span><span className={`metric-icon ${kind}`}>{icon}</span></div><strong>{value}</strong><span className="metric-note">{note}</span></article>}

export function PlatformAdminDashboard(){
  const [view,setView]=useState<View>("overview"),[period,setPeriod]=useState<Period>("30d"),[customDate,setCustomDate]=useState(dateInput()),[data,setData]=useState<AdminData|null>(null),[query,setQuery]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(true);
  const [workspaceOwner,setWorkspaceOwner]=useState("");
  const [urlReady,setUrlReady]=useState(false);
  const [metaAppTarget,setMetaAppTarget]=useState("");
  const [mobileOpen,setMobileOpen]=useState(false);
  const [cloudflare,setCloudflare]=useState<CloudflareUsage|null>(null),[cloudflareError,setCloudflareError]=useState(""),[cloudflareLoading,setCloudflareLoading]=useState(false);
  const range=useMemo(()=>bounds(period,customDate),[period,customDate]);
  const openAnalysisUser=useCallback((userId:string)=>{const url=new URL(window.location.href);url.searchParams.delete("view");url.searchParams.delete("workspace");url.searchParams.set("user",userId);window.history.pushState({},"",url);setView("overview");setMobileOpen(false)},[]);
  const backToGlobal=useCallback(()=>{const url=new URL(window.location.href);url.searchParams.delete("view");url.searchParams.delete("workspace");window.history.pushState({},"",url);setWorkspaceOwner("");setView("overview")},[]);
  useEffect(()=>{const onPop=()=>{const params=new URLSearchParams(window.location.search);const requestedView=params.get("view");const workspace=params.get("workspace")||"";setWorkspaceOwner(workspace);setView(requestedView==="workspace"&&workspace?"workspace":nav.find(item=>item.id===requestedView)?.id||"overview");const nextPeriod=params.get("period");if(nextPeriod&&["today","yesterday","7d","30d","custom","all"].includes(nextPeriod))setPeriod(nextPeriod as Period);if(/^\d{4}-\d{2}-\d{2}$/.test(params.get("date")||""))setCustomDate(params.get("date")!);setUrlReady(true)};onPop();window.addEventListener("popstate",onPop);return()=>window.removeEventListener("popstate",onPop)},[]);
  useEffect(()=>{if(!urlReady)return;const url=new URL(window.location.href);url.searchParams.set("period",period);if(period==="custom")url.searchParams.set("date",customDate);else url.searchParams.delete("date");if(view==="overview"){url.searchParams.delete("view");url.searchParams.delete("workspace")}else{url.searchParams.set("view",view);if(view!=="workspace")url.searchParams.delete("workspace")}window.history.replaceState({},"",url)},[period,customDate,view,urlReady]);
  const load=useCallback(async()=>{try{setLoading(true);const response=await fetch(`/api/admin/overview?${new URLSearchParams(range)}`,{cache:"no-store"});const payload=await response.json() as AdminData&{error?:string};if(!response.ok)throw new Error(payload.error||"Falha ao carregar o painel.");setData(payload);setError("")}catch(e){setError(e instanceof Error?e.message:"Falha ao carregar o painel.")}finally{setLoading(false)}},[range]);
  const loadCloudflare=useCallback(async()=>{try{setCloudflareLoading(true);const response=await fetch("/api/admin/cloudflare-usage",{cache:"no-store"});const payload=await response.json() as CloudflareUsage&{error?:string};if(!response.ok)throw new Error(payload.error||"Falha ao consultar a Cloudflare.");setCloudflare(payload);setCloudflareError("")}catch(e){setCloudflareError(e instanceof Error?e.message:"Falha ao consultar a Cloudflare.")}finally{setCloudflareLoading(false)}},[]);
  useEffect(()=>{if(view==="overview")return;const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer)},[load,view]);
  useEffect(()=>{if(view!=="infrastructure")return;const initial=window.setTimeout(()=>void loadCloudflare(),0);const timer=window.setInterval(()=>void loadCloudflare(),300000);return()=>{window.clearTimeout(initial);window.clearInterval(timer)}},[view,loadCloudflare]);
  const t=data?.totals||{},label=periodNames[period];
  return <main className="app-shell">
    {mobileOpen?<button type="button" className="mobile-nav-backdrop" aria-label="Fechar menu" onClick={()=>setMobileOpen(false)}/>:null}
    <aside className={`sidebar ${mobileOpen?"mobile-open":""}`}>
      <button type="button" className="mobile-sidebar-close" aria-label="Fechar menu" onClick={()=>setMobileOpen(false)}>×</button>
      <Link className="brand" href="/admin"><span className="brand-mark"><i/><i/><i/></span><span>resolv<strong>flow</strong></span></Link>
      <div className="workspace-switcher"><span className="workspace-avatar">RF</span><span><small>Espaço de trabalho</small><strong>Administração global</strong></span><span className="workspace-chevron">⌄</span></div>
      <nav><span className="nav-label">Administração</span>{nav.map(n=><button key={n.id} className={view===n.id?"active":""} onClick={()=>{setView(n.id);setMobileOpen(false)}}><b className={styles.navIcon}>{n.id==="sharkbot"?<PaymentIcon/>:n.icon}</b><span>{n.label}</span>{n.id==="users"?<em>{nf(t.users)}</em>:null}</button>)}</nav>
      <div className="sidebar-footer"><span className="mini-avatar">A</span><span><strong>Administrador</strong><small>Todos os usuários</small></span><Link href="/">↗</Link></div>
    </aside>
    <section className="main-panel">
      <header className="topbar">
        <div className="mobile-brand"><button type="button" className="mobile-menu-button" aria-label="Abrir menu" aria-expanded={mobileOpen} onClick={()=>setMobileOpen(true)}>☰</button><span className="brand-word">resolv<strong>flow</strong></span></div>
        {view!=="overview"?<label className="global-search"><SearchIcon/><input value={query} onFocus={()=>setView("users")} onChange={e=>setQuery(e.target.value)} placeholder="Buscar usuários por nome ou e-mail..." aria-label="Buscar usuários por nome ou e-mail"/></label>:null}
        <div className="global-period"><span>Período</span><select value={period} onChange={e=>setPeriod(e.target.value as Period)}><option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option><option value="custom">Dia específico</option><option value="all">Todo o período</option></select>{period==="custom"?<input type="date" value={customDate} onChange={e=>setCustomDate(e.target.value)}/>:null}</div>
        {view!=="overview"?<div className="top-actions"><span className="sync-status"><i/>Motor disponível</span><button className="icon-button" onClick={()=>{void load();if(view==="infrastructure")void loadCloudflare()}} disabled={loading||cloudflareLoading} aria-label="Atualizar"><RefreshIcon/></button></div>:null}
      </header>
      <div className={`content ${styles.content}`}>
        {error&&view!=="overview"?<div className={styles.error}>{error}</div>:null}
        {view!=="workspace"&&view!=="overview"?<div className="page-heading"><div><span className="eyebrow">Central de operações</span><h1>{nav.find(n=>n.id===view)?.label}</h1><p>Controle global sem alterar os workspaces dos clientes.</p></div><button className="outline-button" onClick={()=>{void load();if(view==="infrastructure")void loadCloudflare()}} disabled={loading||cloudflareLoading}><RefreshIcon/>{loading||cloudflareLoading?"Sincronizando...":"Sincronizar dados"}</button></div>:null}
        <div className={styles.mobilePeriod}><label>Período<select value={period} onChange={e=>setPeriod(e.target.value as Period)}><option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option><option value="custom">Dia específico</option><option value="all">Todo o período</option></select></label>{period==="custom"?<input type="date" value={customDate} onChange={e=>setCustomDate(e.target.value)} aria-label="Dia específico"/>:null}</div>
        {view==="overview"?<AdminAnalysisDashboard from={range.from} to={range.to} periodLabel={label}/>:null}
        {view==="users"?<AdminUsersDirectory query={query} onQueryChange={setQuery} from={range.from} to={range.to} periodLabel={label} onOpenAnalysis={openAnalysisUser} onOpenMetaApp={(workspaceOwnerUserId)=>{setMetaAppTarget(workspaceOwnerUserId);setView("metaapps")}}/>:null}
        {view==="workspace"&&workspaceOwner?<AdminWorkspaceView key={workspaceOwner} owner={workspaceOwner} from={range.from} to={range.to} periodLabel={label} onBack={backToGlobal}/>:null}
        {view==="metaapps"?<MetaAppsManager initialWorkspaceOwnerUserId={metaAppTarget}/>:null}
        {view==="otp"?<AdminOtpCenter from={range.from} to={range.to}/>:null}
        {view==="infrastructure"?<CloudflarePanel usage={cloudflare} error={cloudflareError} loading={cloudflareLoading} platform={data?.platform||{}} data={data}/>:null}
        {view==="sharkbot"?<SharkBotPanel data={data} totals={t} label={label}/>:null}
        {view==="activity"?<section className={`panel ${styles.directory}`}><div className="panel-heading"><div><span className="panel-kicker">Rastreabilidade</span><h2>Atividade recente</h2></div></div><div className={styles.timeline}>{data?.audit.map(a=><article key={a.id}><time>{formatDate(a.createdAt)}</time><span><strong>{a.summary}</strong><small>{a.actorEmail} · {a.action}</small></span></article>)}</div></section>:null}
      </div>
    </section>
    <div className="sharkbot-notifier-host"><SharkBotSaleNotifier/></div>
  </main>
}

function Stat({label,value,note}:{label:string;value:string;note:string}){return <div className={styles.stat}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>}
function CloudflarePanel({usage,error,loading,platform,data}:{usage:CloudflareUsage|null;error:string;loading:boolean;platform:Record<string,string>;data:AdminData|null}){
  const reads=usage?.today.rowsRead||0,writes=usage?.today.rowsWritten||0,queries=(usage?.today.readQueries||0)+(usage?.today.writeQueries||0),storage=usage?.storage.bytes||0;
  const readLimit=usage?.benchmarks.freeDaily.rowsRead||5_000_000,writeLimit=usage?.benchmarks.freeDaily.rowsWritten||100_000,storageLimit=usage?.benchmarks.freeDaily.storageBytes||5_000_000_000;
  const paidReadLimit=usage?.benchmarks.paidMonthlyIncluded.rowsRead||25_000_000_000,paidWriteLimit=usage?.benchmarks.paidMonthlyIncluded.rowsWritten||50_000_000;
  const readPercent=percent(reads,readLimit),writePercent=percent(writes,writeLimit),storagePercent=percent(storage,storageLimit);
  const warning=Math.max(readPercent,writePercent,storagePercent);
  const billing=usage?.billing.subscription;
  return <>
    {error?<div className={styles.error}>{error}</div>:null}
    <section className="metric-grid">
      <Metric title="Linhas lidas · hoje" value={loading&&!usage?"…":nf(reads)} note={`Projeção até 00:00 UTC: ${nf(usage?.projectedToday.rowsRead||0)}`} icon="DB" kind="accent"/>
      <Metric title="Linhas escritas · hoje" value={loading&&!usage?"…":nf(writes)} note={`Projeção até 00:00 UTC: ${nf(usage?.projectedToday.rowsWritten||0)}`} icon="↗" kind="purple"/>
      <Metric title="Consultas D1 · hoje" value={loading&&!usage?"…":nf(queries)} note={`${nf(usage?.today.readQueries||0)} leituras · ${nf(usage?.today.writeQueries||0)} escritas`} icon="Σ" kind="blue"/>
      <Metric title="Armazenamento D1" value={loading&&!usage?"…":bytes(storage)} note={usage?.storage.available?`${storagePercent.toFixed(1).replace(".",",")}% usado · ${bytes(Math.max(0,storageLimit-storage))} livres`:"Métrica aguardando leitura da Cloudflare"} icon="GB" kind="coral"/>
    </section>
    <div className="dashboard-columns">
      <section className={`panel health-panel ${styles.usagePanel}`}>
        <div className="panel-heading"><div><span className="panel-kicker">Medição da conta Cloudflare · hoje UTC</span><h2>Consumo real do D1</h2></div><span className={`ready-pill ${warning>=80?"is-pending":""}`}><i/>{reads>readLimit||writes>writeLimit?"Acima da referência Free":warning>=80?"Atenção":"Uso monitorado"}</span></div>
        <UsageBar label="Leituras · referência Free diária" used={reads} limit={readLimit}/>
        <UsageBar label="Escritas · referência Free diária" used={writes} limit={writeLimit}/>
        <UsageBar label="Armazenamento" used={storage} limit={storageLimit} formatter={bytes}/>
        <div className={styles.cloudMeta}><span>Atualizado {formatDate(usage?.checkedAt)}</span><span>Reinício diário às {usage?.resetAtUtc||"00:00"} UTC (21:00 em Brasília)</span><span>Fonte: {usage?.source||"Cloudflare GraphQL Analytics"}</span></div>
        {usage?.storageError?<div className={styles.cloudNotice}><strong>Armazenamento temporariamente indisponível</strong><p>{usage.storageError}</p></div>:null}
        {reads>readLimit||writes>writeLimit?<div className={styles.cloudNotice}><strong>A conta está operando acima da franquia diária Free</strong><p>{usage?.billing.available?"O plano pago foi consultado diretamente na cobrança da Cloudflare.":"O consumo técnico está disponível, mas os dados de cobrança não puderam ser lidos."}</p></div>:null}
      </section>
      <section className={`panel health-panel ${styles.definition}`}><div className="panel-heading"><div><span className="panel-kicker">Ciclo vigente da assinatura</span><h2>Plano e franquia mensal</h2></div><span className={`ready-pill ${usage?.billing.available?"":"is-pending"}`}><i/>{billing?.state|| (usage?.billing.available?"Billing conectado":"Billing indisponível")}</span></div><UsageBar label="Leituras · incluído no Paid" used={usage?.billing.usage.rowsRead||0} limit={paidReadLimit}/><UsageBar label="Escritas · incluído no Paid" used={usage?.billing.usage.rowsWritten||0} limit={paidWriteLimit}/><dl><div><dt>Plano</dt><dd>{billing?.name||"Workers Paid"}</dd></div><div><dt>Ciclo atual</dt><dd>{billing?.periodStart&&billing?.periodEnd?`${formatDate(billing.periodStart)} → ${formatDate(billing.periodEnd)}`:"Não informado pela assinatura"}</dd></div><div><dt>Renovação</dt><dd>{formatDate(billing?.periodEnd)}</dd></div><div><dt>Preço-base</dt><dd>{billing?.price?new Intl.NumberFormat("pt-BR",{style:"currency",currency:billing.currency||"USD"}).format(billing.price):"Não informado"}</dd></div><div><dt>Consultas no ciclo</dt><dd>{nf((usage?.billing.usage.readQueries||0)+(usage?.billing.usage.writeQueries||0))}</dd></div><div><dt>Banco principal</dt><dd>{bytes(usage?.storage.primaryDatabaseBytes||0)}</dd></div><div><dt>Bancos medidos</dt><dd>{nf(usage?.storage.databases||0)}</dd></div><div><dt>Retenção das métricas</dt><dd>{usage?.retentionDays||31} dias</dd></div></dl>{usage?.billing.error?<div className={styles.cloudNotice}><strong>Billing Read não respondeu</strong><p>{usage.billing.error}</p></div>:null}<div className={styles.cloudMeta}>{Object.entries(platform).map(([k,v])=><span key={k}>{k}: {v}</span>)}</div></section>
    </div>
    <section className={`panel ${styles.directory} ${styles.usageHistory}`}><div className="panel-heading"><div><span className="panel-kicker">Últimos dias</span><h2>Histórico de consumo</h2></div><span className="date-pill">Cloudflare Analytics</span></div><div className="account-table-wrap"><table className="account-table"><thead><tr><th>Data UTC</th><th>Linhas lidas</th><th>Linhas escritas</th><th>Consultas de leitura</th><th>Consultas de escrita</th></tr></thead><tbody>{usage?.history.slice(-10).reverse().map(day=><tr key={day.date}><td><strong>{new Date(`${day.date}T12:00:00Z`).toLocaleDateString("pt-BR")}</strong></td><td className="numeric">{nf(day.rowsRead)}</td><td className="numeric">{nf(day.rowsWritten)}</td><td className="numeric">{nf(day.readQueries)}</td><td className="numeric">{nf(day.writeQueries)}</td></tr>)}</tbody></table></div></section>
    <p className={styles.updated}>As métricas podem levar alguns minutos para aparecer na API da Cloudflare.</p>
    <div className={styles.infrastructureService}><ServicePanel data={data}/></div>
  </>
}
function UsageBar({label,used,limit,formatter=nf}:{label:string;used:number;limit:number;formatter?:(value:number)=>string}){const value=percent(used,limit);return <div className={styles.usageRow}><div><strong>{label}</strong><span>{formatter(used)} de {formatter(limit)}</span></div><div className={styles.usageTrack}><i style={{width:`${value}%`}}/></div><small>{value.toFixed(1).replace(".",",")}%</small></div>}
function SharkBotPanel({data,totals,label}:{data:AdminData|null;totals:Record<string,number>;label:string}){
  const conversion=totals.sharkbotLeads?`${(totals.sharkbotApproved/totals.sharkbotLeads*100).toFixed(1).replace(".",",")}%`:"0%";
  return <>
    <section className="metric-grid"><Metric title={`Leads · ${label}`} value={nf(totals.sharkbotLeads)} note="Entradas recebidas pelo webhook" icon="+" kind="accent"/><Metric title="Pagamentos criados" value={nf(totals.sharkbotCreated)} note="Cobranças iniciadas" icon="PIX" kind="purple"/><Metric title="Vendas aprovadas" value={nf(totals.sharkbotApproved)} note={`${conversion} de conversão sobre leads`} icon="✓" kind="blue"/><Metric title="Faturamento aprovado" value={money(totals.sharkbotRevenueCents)} note={`${nf(totals.sharkbotEvents)} eventos no período`} icon="R$" kind="coral"/></section>
    <div className="dashboard-columns">
      <section className={`panel health-panel ${styles.sharkBreakdown}`}><div className="panel-heading"><div><span className="panel-kicker">Desempenho por origem</span><h2>Bots e fluxos</h2></div><span className={`ready-pill ${data?.sharkbot.configured?"":"is-pending"}`}><i/>{data?.sharkbot.configured?"Webhook ativo":"Secret pendente"}</span></div><div className={styles.breakdown}>{data?.sharkbot.breakdown.length?data.sharkbot.breakdown.map((item,index)=><article key={`${item.botName}-${item.flowName}-${item.gateway}-${index}`}><span><strong>{item.flowName||"Fluxo não informado"}</strong><small>{item.botName||"Bot não informado"} · {item.gateway||"Gateway não informado"}</small></span><span><b>{nf(item.leads)}</b><small>leads</small></span><span><b>{nf(item.approved)}</b><small>vendas</small></span><span><b>{money(item.revenueCents)}</b><small>receita</small></span></article>):<p className={styles.empty}>Nenhum evento neste período.</p>}</div></section>
      <section className={`panel focus-panel ${styles.business}`}><div className="panel-heading"><div><span className="panel-kicker">Integração</span><h2>SharkBot em tempo real</h2></div></div><Stat label="Status" value={data?.sharkbot.configured?"Conectada":"Pendente"} note="Assinatura HMAC validada antes de gravar"/><div className={styles.divider}/><Stat label="Último evento" value={formatDate(data?.sharkbot.events[0]?.occurredAt)} note="Notificações verificadas automaticamente"/></section>
    </div>
    <section className={`panel ${styles.directory} ${styles.sharkEvents}`}><div className="panel-heading"><div><span className="panel-kicker">Histórico operacional</span><h2>Eventos da SharkBot</h2></div><span className="date-pill">{data?.sharkbot.events.length||0} exibidos</span></div><div className="account-table-wrap"><table className="account-table"><thead><tr><th>Evento</th><th>Cliente</th><th>Bot / fluxo</th><th>Gateway</th><th>Valor</th><th>Horário</th></tr></thead><tbody>{data?.sharkbot.events.map(event=><tr key={event.id}><td><strong>{event.eventType==="payment_approved"?"Venda aprovada":event.eventType==="payment_created"?"Pagamento criado":event.eventType==="new_lead"?"Novo lead":"Evento"}</strong><small>{event.status||event.paymentId||"—"}</small></td><td>{event.payerName||"Não informado"}</td><td><strong>{event.flowName||"—"}</strong><small>{event.botName||"Bot não informado"}</small></td><td>{event.gateway||"—"}</td><td className="numeric">{event.amountCents?money(event.amountCents):"—"}</td><td>{formatDate(event.occurredAt)}</td></tr>)}</tbody></table></div></section>
  </>
}
function ServicePanel({data,setView}:{data:AdminData|null;setView?:(view:View)=>void}){return <section className={`panel health-panel ${styles.service}`}><div className="panel-heading"><div><span className="panel-kicker">Camada de serviço</span><h2>Infraestrutura</h2></div>{setView?<button className="text-button" onClick={()=>setView("infrastructure")}>Detalhes</button>:null}</div><div className={styles.serviceList}>{data?.health.slice(0,setView?5:99).map(h=><article key={h.key}><i className={h.status==="healthy"?styles.good:h.status==="error"?styles.bad:styles.warn}/><div><strong>{h.key}</strong><small>{h.lastError||`Atualizado ${formatDate(h.updatedAt)}`}</small></div><span>{h.status}</span></article>)}</div></section>}
