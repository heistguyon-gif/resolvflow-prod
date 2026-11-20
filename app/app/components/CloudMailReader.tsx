"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { mailProviderTab } from "./mailProviderTabs";
import styles from "./CloudMailReader.module.css";
import { filterMailAccounts, filterMailHistory, mailAccountPage, mailCodeCount, selectMailPage, type ReaderAccount, type MailHistoryView, type MailFolderView, type MailStatusView, type MailSort } from "./cloudMailFilters";
import { createMailHistoryQueue } from "./mailHistoryQueue";
import { cloudMailApi } from "./cloudMailApi";
import { createCloudMailWait, idleMailWait, mailWaitActive, MailWaitError } from "./cloudMailWait";
import { CloudMailHistory, type ReaderMessage } from "./CloudMailHistory";
import { CloudMailExport } from "./CloudMailExport";
import { MailWorkbenchTimeline } from "./MailWorkbenchTimeline";
import type { MailClockZone, MailHistoryOrder } from "./mailWorkbenchView";
type Account = ReaderAccount & {source?:"microsoft_graph"|"mixotp";capabilities?:{read:boolean;graphExport:boolean;botBridge:boolean}};
const isMixOtp=(account:Account)=>account.source==="mixotp";
const readable=(account:Account)=>account.capabilities?.read!==false;
const exportable=(account:Account)=>!isMixOtp(account)&&account.capabilities?.graphExport!==false&&account.capabilities?.botBridge!==false;
type Message = ReaderMessage & {observedAt?:string};
const labels:Record<string,string>={ready:"Pronta para consultar",ok:"Leitura confirmada",reading:"Consulta em andamento",auth:"Renove a autorização",permission:"Sem permissão de leitura",identity:"Identidade divergente",throttle:"Aguarde o limite Microsoft",network:"Falha de conexão",service:"Serviço indisponível",history_capacity:"Histórico preservado · limite atingido"};
const date=(value:string|null)=>value?new Date(value).toLocaleString("pt-BR"):"Ainda não consultada";
const accountStatus=(account:Account)=>isMixOtp(account)
 ? ({ready:"Pedido pronto para consultar",ok:"Consulta ao fornecedor concluída",reading:"Consultando o pedido",throttle:"Aguarde o limite do fornecedor"}[account.status]||labels[account.status]||"Consulta não concluída")
 : labels[account.status]||"Consulta não concluída";

type Organization={enabled:boolean;deletionReady:boolean;entries:Record<string,{archived:boolean}>};
type DeletionPreview={accountId:string;email:string;messages:number;deletionReady:boolean;blockedReason:string|null};
type Change={operation:"archive"|"restore"|"delete";ids:string[];requestId:string;preview?:DeletionPreview};
type ApiResponse={error?:string;accounts:Account[];account?:Account;messages:Message[];imported:number;existing:number;organization?:Organization;exportAllowed?:boolean};
function api<T=ApiResponse>(path="",body?:unknown,signal?:AbortSignal){ return cloudMailApi<T>(path,body,signal); }
async function refreshMailbox(id: string, signal?: AbortSignal) {
 const result = await api("", {action:"refresh", accountId:id}, signal);
 if(result.account && result.account.id !== id)throw new MailWaitError("Resposta inválida para esta caixa.","response_invalid");
 // Older v1 deployments return only the refresh acknowledgement.
 return result.account?.id === id && Array.isArray(result.messages) ? result : api("?id="+encodeURIComponent(id), undefined, signal);
}
type ReaderProps={providerTabs?:boolean;personalPanel?:boolean;quickImport?:boolean;readerScope?:string;workbench?:boolean};
export function CloudMailReader({personalPanel=false,quickImport=false,readerScope="",workbench=false,providerTabs=false}:ReaderProps={}){
 // A new authenticated identity gets a new panel, including all request refs.
 return <CloudMailReaderPanel key={readerScope} personalPanel={personalPanel} quickImport={quickImport} workbench={workbench} providerTabs={providerTabs}/>;
}
function CloudMailReaderPanel({personalPanel,quickImport,workbench,providerTabs}:{personalPanel:boolean;quickImport:boolean;workbench:boolean;providerTabs:boolean}){
 const [view,setView]=useState<"compare"|"timeline"|"focus">("compare"),[zone,setZone]=useState<MailClockZone>("local"),[historyOrder,setHistoryOrder]=useState<MailHistoryOrder>("newest"),[density,setDensity]=useState<"compact"|"comfortable">("compact"),[sourceFilter,setSourceFilter]=useState("all");
 const [theme,setTheme]=useState("dark"),[allAccounts,setAccounts]=useState<Account[]>([]),[selected,setSelected]=useState<string[]>([]),[query,setQuery]=useState("");
 const [providerTab,setProviderTab]=useState<"hotmail"|"gmail">("hotmail");
 const tabSelections=useRef<Record<string,string[]>>({hotmail:[],gmail:[]});
 const accounts=providerTabs?allAccounts.filter(a=>mailProviderTab(a.email)===providerTab):allAccounts;
 const [messages,setMessages]=useState<Record<string,Message[]>>({}),[busy,setBusy]=useState(false),[progress,setProgress]=useState(""),[notice,setNotice]=useState(""),[error,setError]=useState("");
 const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[historyFilter,setHistoryFilter]=useState<MailHistoryView>("all"),[focusId,setFocusId]=useState("");
 const [waitState,setWaitState]=useState(idleMailWait),[clockNow,setClockNow]=useState(0);
 const waitController=useRef<ReturnType<typeof createCloudMailWait<ApiResponse>>|null>(null);
 const manualController=useRef<AbortController|null>(null),manualGeneration=useRef(0);
 const waiting=mailWaitActive(waitState);
 const [auto,setAuto]=useState(false),[showImport,setShowImport]=useState(false),[loading,setLoading]=useState(true);
 const inflight=useRef(false),fileInput=useRef<HTMLInputElement>(null);
 const importRunning=useRef(false),pickerOpen=useRef(false),importLife=useRef({mounted:false,generation:0,controller:null as AbortController|null});
 const [importing,setImporting]=useState(false);
 useLayoutEffect(()=>{
  const life=importLife.current,input=fileInput.current;
  const cancelPicker=()=>{pickerOpen.current=false;if(input)input.value="";};
  life.mounted=true;input?.addEventListener("cancel",cancelPicker);
  return()=>{life.mounted=false;life.generation++;life.controller?.abort();input?.removeEventListener("cancel",cancelPicker);cancelPicker();};
 },[]);
 const historyQueue=useMemo(()=>createMailHistoryQueue((id:string)=>api("?id="+encodeURIComponent(id))),[]);
 const historyLoaded=useRef(new Set<string>()),previousSelection=useRef(new Set<string>()),historyVersion=useRef<Record<string,number>>({});
 const [organization,setOrganization]=useState<Organization>({enabled:false,deletionReady:false,entries:{}});
 const [exportAllowed,setExportAllowed]=useState(false);
 const [exportBusy,setExportBusy]=useState(false);
 const enhanced=personalPanel||organization.enabled;
 const [folder,setFolder]=useState<MailFolderView>("active"),[status,setStatus]=useState<MailStatusView>("all"),[sort,setSort]=useState<MailSort>("newest"),[historyQuery,setHistoryQuery]=useState("");
 const [change,setChange]=useState<Change|null>(null),[confirmEmail,setConfirmEmail]=useState("");const dialog=useRef<HTMLDialogElement>(null),changeTrigger=useRef<HTMLElement|null>(null);
 const applyDetail=useCallback((id:string,d:ApiResponse)=>{
  historyLoaded.current.add(id);setMessages(m=>({...m,[id]:d.messages}));
  if(d.account?.id===id)setAccounts(a=>a.map(x=>x.id===id?d.account!:x));
 },[]);
 const cancelManual=useCallback(()=>{manualGeneration.current++;manualController.current?.abort();},[]);
 useEffect(()=>{
  const controller=createCloudMailWait<ApiResponse>({load:(id,signal)=>api("?id="+encodeURIComponent(id),undefined,signal),refresh:refreshMailbox,onData:applyDetail,onState:setWaitState});
  waitController.current=controller;
  return()=>{controller.dispose();cancelManual();historyQueue.retain([]);};
 },[applyDetail,historyQueue,cancelManual]);
 useEffect(()=>{
  if(!waiting)return;
  const timer=window.setInterval(()=>setClockNow(Date.now()),1000);
  return()=>clearInterval(timer);
 },[waiting]);
 const stopWait=()=>waitController.current?.cancel();
 function changeSelection(ids:string[]){stopWait();cancelManual();setAuto(false);setSelected(ids);}
 function startWait(){
  if(!enhanced||selected.length!==1||busy||change||inflight.current||accounts.some(a=>selected.includes(a.id)&&!readable(a)))return;
  historyVersion.current[selected[0]]=(historyVersion.current[selected[0]]??0)+1;
  setAuto(false);setError("");setNotice("");setClockNow(Date.now());
  if(!waitController.current?.start(selected[0]))setNotice("A consulta anterior ainda está terminando. Aguarde antes de iniciar outra espera.");
 }
 const applyView=useCallback((d:ApiResponse)=>{setAccounts(d.accounts);setExportAllowed(d.exportAllowed===true);if(d.organization)setOrganization(d.organization);setLoading(false);},[]);
 useEffect(()=>{const id=requestAnimationFrame(()=>{const saved=localStorage.getItem("resolv-mail-theme");if(saved==="light"||saved==="dark")setTheme(saved);});return()=>cancelAnimationFrame(id);},[]);
 const load=useCallback(async()=>{applyView(await api());},[applyView]);
 useEffect(()=>{let alive=true;void api().then(d=>{if(alive)applyView(d);}).catch(e=>{if(alive){setError(e.message);setLoading(false);}});return()=>{alive=false;};},[applyView]);
 useEffect(()=>{if(change&&!dialog.current?.open)dialog.current?.showModal();if(!change){if(dialog.current?.open)dialog.current.close();changeTrigger.current?.focus();changeTrigger.current=null;}},[change]);
 useEffect(()=>{
  let stopped=false;historyQueue.retain(selected);
  for(const id of selected){
   if(historyLoaded.current.has(id)&&previousSelection.current.has(id))continue;
   historyLoaded.current.delete(id);
   const version=historyVersion.current[id]??0;
   void historyQueue.read(id).then(d=>{if(stopped||version!==(historyVersion.current[id]??0))return;historyLoaded.current.add(id);setMessages(m=>({...m,[id]:d.messages}));if(d.account?.id===id)setAccounts(a=>a.map(x=>x.id===id?d.account!:x));}).catch(e=>{if(!stopped&&version===(historyVersion.current[id]??0))setError(e instanceof Error?e.message:"Falha ao carregar histórico.");});
  }
  previousSelection.current=new Set(selected);return()=>{stopped=true;};
 },[selected,historyQueue]);
 const refresh=useCallback(async()=>{
  if(inflight.current||importRunning.current||waitController.current?.inFlight||!selected.length||change||waiting||accounts.some(a=>selected.includes(a.id)&&!readable(a)))return;inflight.current=true;setBusy(true);setError("");setNotice("");let done=0;const failures:string[]=[];
  let legacyResponse=false;
  const generation=++manualGeneration.current,controller=new AbortController();manualController.current=controller;
  const timer=window.setTimeout(()=>controller.abort(),120000);
  const current=()=>generation===manualGeneration.current&&!controller.signal.aborted;
  const applyAccount=(id:string,d:ApiResponse)=>{if(!current())return;historyLoaded.current.add(id);setMessages(m=>({...m,[id]:d.messages}));if(d.account?.id===id)setAccounts(a=>a.map(x=>x.id===id?d.account!:x));else legacyResponse=true;};
  try{for(const id of selected){if(!current())break;historyVersion.current[id]=(historyVersion.current[id]??0)+1;setProgress(`Consultando ${done+1} de ${selected.length}`);try{applyAccount(id,await refreshMailbox(id,controller.signal));}catch(e){if(!current())break;failures.push(`${accounts.find(a=>a.id===id)?.email||"Caixa"}: ${e instanceof Error?e.message:"Falha na consulta"}`);try{applyAccount(id,await api("?id="+encodeURIComponent(id),undefined,controller.signal));}catch{/* Keep the last displayed history if saved data is also unavailable. */}}done++;}if(!current())return;if(legacyResponse)await load();if(failures.length)setError(failures.join(" · "));else setNotice(`${done} caixa(s) atualizada(s). Histórico preservado.`);}catch(e){setError(e instanceof Error?e.message:"Falha na consulta.");}finally{clearTimeout(timer);if(controller.signal.aborted&&generation===manualGeneration.current)setError("A consulta foi interrompida após o limite de espera. Histórico preservado.");inflight.current=false;setBusy(false);setProgress("");manualController.current=null;}
 },[selected,accounts,load,change,waiting]);
 useEffect(()=>{if(!auto||enhanced)return;const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void refresh();},30000);return()=>clearInterval(timer);},[auto,refresh,enhanced]);
 function openImport(){
  if(importRunning.current||pickerOpen.current||busy||waiting||exportBusy||change||loading||waitController.current?.inFlight)return;
  if(!quickImport){setShowImport(v=>!v);return;}
  pickerOpen.current=true;fileInput.current?.click();
 }
 async function importFile(file=fileInput.current?.files?.[0]){
  if(!file||importRunning.current||busy||waiting||exportBusy||change||waitController.current?.inFlight)return;
  const input=fileInput.current,generation=++importLife.current.generation,controller=new AbortController();
  const current=()=>importLife.current.mounted&&generation===importLife.current.generation&&!controller.signal.aborted;
  importRunning.current=true;importLife.current.controller=controller;setImporting(true);setBusy(true);setError("");setNotice("");
  let accepted=false,reading=true;
  try{
   if(file.size>2_000_000){setError("Use um arquivo .txt de até 2 MB.");return;}
   const text=await file.text();
   if(!current())return;
   reading=false;
   const result=await api("",{action:"import",text},controller.signal);
   if(!current())return;
   if(!Number.isSafeInteger(result.imported)||result.imported<0||!Number.isSafeInteger(result.existing)||result.existing<0)throw new MailWaitError("Resposta inválida.","response_invalid");
   accepted=true;
   setNotice(`${result.imported} caixa(s) importada(s); ${result.existing} já estavam salvas. Autorizações existentes preservadas.`);
   setShowImport(false);
   const state=await api("",undefined,controller.signal);
   if(current())applyView(state);
  }catch(cause){
   if(current()){
    const code=cause instanceof MailWaitError?cause.code:"";
    setError(accepted?"Arquivo processado. Não foi possível atualizar a lista; recarregue o painel para conferir.":reading?"Não foi possível ler o arquivo selecionado.":code==="import_duplicate"?"O arquivo contém e-mails duplicados. Revise as linhas antes de importar.":code==="import_invalid"?quickImport?"Arquivo inválido. Use TXT Microsoft de quatro ou cinco campos, ou e-mail e link do pedido MixOTP separados por quatro hífens.":"Arquivo inválido. Use quatro ou cinco campos separados por |.":"Não foi possível confirmar a importação. Confira a lista antes de tentar novamente.");
   }
  }finally{
   if(input)input.value="";
   if(current()){importRunning.current=false;importLife.current.controller=null;setBusy(false);setImporting(false);}
  }
 }
 async function copy(value:string){try{await navigator.clipboard.writeText(value);setNotice("Copiado para a área de transferência.");}catch{setError("Não foi possível copiar. Selecione o texto e use Ctrl+C.");}}
 function download(){const payload=selected.map(id=>({email:accounts.find(a=>a.id===id)?.email,messages:messages[id]||[]}));const url=URL.createObjectURL(new Blob([JSON.stringify({exportedAt:new Date().toISOString(),accounts:payload},null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="historico-emails.json";a.click();URL.revokeObjectURL(url);}
 const filtered=(enhanced?filterMailHistory(filterMailAccounts(accounts,organization.entries,query,folder,status,sort),historyFilter):accounts.filter(a=>a.email.toLowerCase().includes(query.toLowerCase()))).filter(a=>!workbench||sourceFilter==="all"||(a.source||"microsoft_graph")===sourceFilter);
 const accountPage=mailAccountPage(filtered,page,pageSize),visible=enhanced?accountPage.items:filtered;
 const focused=selected.includes(focusId)?focusId:selected[0];
 const displayed=workbench&&view!=="focus"?selected:enhanced?(focused?[focused]:[]):selected;
 const ExportContainer=workbench?"details":"div";
 function switchProviderTab(next:"hotmail"|"gmail"){
  if(next===providerTab||busy||waiting||exportBusy||importing||change||pickerOpen.current)return;
  tabSelections.current[providerTab]=selected;
  changeSelection(tabSelections.current[next].filter(id=>allAccounts.some(a=>a.id===id&&mailProviderTab(a.email)===next)));
  setProviderTab(next);setPage(1);setFocusId("");setQuery("");setHistoryQuery("");setSourceFilter("all");setError("");setNotice("");
 }
 const locked=busy||waiting||exportBusy;
 const hasMixOtp=accounts.some(isMixOtp),unsupportedExport=accounts.some(a=>selected.includes(a.id)&&!exportable(a)),unreadableSelection=accounts.some(a=>selected.includes(a.id)&&!readable(a));
 const offPage=selected.filter(id=>!visible.some(a=>a.id===id)).length;
 const clearSelection=()=>{setPage(1);changeSelection([]);};
 const openChange=async(operation:Change["operation"])=>{
  if(busy||waiting||waitController.current?.inFlight)return;changeTrigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  setError("");setConfirmEmail("");setAuto(false);
  const ids=selected.filter(id=>filtered.some(a=>a.id===id));if(!ids.length)return;
  if(operation!=="delete"){setChange({operation,ids,requestId:crypto.randomUUID()});return;}
  if(ids.length!==1)return;setBusy(true);
  try{const d=await api<DeletionPreview>("?deletePreview="+encodeURIComponent(ids[0]));if(d.accountId!==ids[0]||typeof d.email!=="string"||typeof d.deletionReady!=="boolean"||typeof d.messages!=="number")throw Error("Não foi possível revisar a exclusão.");setChange({operation,ids,requestId:crypto.randomUUID(),preview:d});}catch(e){setError(e instanceof Error?e.message:"Falha na revisão.");}finally{setBusy(false);}
 };
 const executeChange=async()=>{
  if(!change||busy)return;setBusy(true);inflight.current=true;setError("");
  try{
   if(change.operation==="delete"){
    if(!change.preview?.deletionReady||confirmEmail.toLowerCase()!==change.preview.email.toLowerCase())return;
    await api("",{action:"delete",requestId:change.requestId,accountId:change.ids[0],confirmEmail});
   }else await api("",{action:"organize",requestId:change.requestId,operation:change.operation,accountIds:change.ids});
   await load();clearSelection();setChange(null);setNotice(change.operation==="delete"?"Caixa excluída do painel.":change.operation==="archive"?"Seleção arquivada. Credenciais, histórico e acesso do bot preservados.":"Seleção restaurada para a lista ativa.");
  }catch(e){setError(e instanceof Error?e.message:"Não foi possível concluir. Tente novamente nesta revisão.");}finally{inflight.current=false;setBusy(false);}
 };
 return <main className={styles.page} data-mail-theme={theme} data-mail-pilot={enhanced} data-mail-workbench={workbench} data-mail-density={density}>
  <div className={styles.container}><header className={styles.header}><div><a className={styles.brand} href="https://resolvflow.online/">resolv<span>flow</span></a><span className={styles.kicker}>{workbench?"Leitor pessoal / Espaço de trabalho":"Seu painel de e-mails"}</span><h1>{workbench?"Caixas & códigos":enhanced?"Central de caixas de e-mail":"Seus códigos, em um lugar."}</h1><p>{workbench?"Compare caixas. Identifique o horário. Copie com contexto.":"Consulte suas caixas, copie os códigos e acompanhe o histórico."}</p></div><div className={styles.headerActions}><button onClick={()=>{const next=theme==="dark"?"light":"dark";setTheme(next);localStorage.setItem("resolv-mail-theme",next);}} aria-label={theme==="dark"?"Ativar modo claro":"Ativar modo escuro"}>{theme==="dark"?"☀ Modo claro":"☾ Modo escuro"}</button><a href="/logout">Sair</a></div></header>
  {providerTabs?<div role="group" aria-label="Tipo de e-mail" className={styles.providerTabs}><button type="button" aria-pressed={providerTab==="hotmail"} disabled={locked||importing||Boolean(change)} onClick={()=>switchProviderTab("hotmail")}>Hotmails</button><button type="button" aria-pressed={providerTab==="gmail"} disabled={locked||importing||Boolean(change)} onClick={()=>switchProviderTab("gmail")}>Gmails</button></div>:null}
  <div className={styles.summary}><div><strong>{accounts.length}</strong><span>caixas salvas</span></div><div><strong>{selected.length}</strong><span>selecionadas</span></div><div><span className={styles.online}>{workbench?"Histórico preservado":"● Online"}</span><span>{workbench?"Consulta ao fornecedor sob demanda":"Disponível com seu PC desligado"}</span></div><button onClick={openImport} disabled={locked||(quickImport&&loading)} aria-describedby={quickImport?"mail-import-help":undefined}>{quickImport?importing?"Importando arquivo…":"Importar arquivo":"＋ Importar caixas"}</button></div>
  {quickImport?<><input ref={fileInput} type="file" accept=".txt,text/plain" hidden aria-label="Arquivo TXT para importação" disabled={locked} onChange={event=>{pickerOpen.current=false;void importFile(event.currentTarget.files?.[0]);}}/><p id="mail-import-help" className={styles.muted}>{providerTabs?"TXT Microsoft: quatro ou cinco campos separados por |. MixOTP (Gmail ou Hotmail): e-mail e link do pedido separados por quatro hífens. Arquivo misto importa todas as linhas para suas abas. Qualquer linha inválida bloqueia o arquivo inteiro. Gmail MixOTP fornece códigos do pedido.":"TXT Microsoft: quatro ou cinco campos separados por |. MixOTP: e-mail e link do pedido separados por quatro hífens."} Ao confirmar o arquivo, a importação começa. Caixas já salvas são preservadas.</p></>:null}
  {error?<p className={styles.error} role="alert">{error}</p>:null}{notice?<p className={styles.notice} role="status">{notice}</p>:null}
  {exportAllowed?<ExportContainer className={styles.exportPanel}>{workbench?<summary>Exportação de caixas e histórico <span>Opções autorizadas para este login</span></summary>:null}{accounts.some(a=>!exportable(a))?<p className={styles.muted} role="status">MixOTP fornece apenas códigos do pedido, sem credenciais Graph ou bridge do Bot. Para exportar, selecione somente caixas Microsoft compatíveis. A opção Todas será recusada se incluir uma origem incompatível; nenhum arquivo parcial será gerado.</p>:null}<CloudMailExport accounts={accounts} selected={selected} disabled={locked||loading||unsupportedExport} onBusyChange={setExportBusy} scopeIds={providerTabs?accounts.map(a=>a.id):undefined}/></ExportContainer>:null}
  {organization.enabled?<div className={styles.organizationSummary}><span>{accounts.filter(a=>!organization.entries[a.id]?.archived).length} ativas</span><span>{accounts.filter(a=>organization.entries[a.id]?.archived).length} arquivadas</span><small>Sua organização da lista preserva o histórico e não altera as reservas do bot.</small></div>:null}
  {!quickImport&&showImport?<section className={styles.import}><h2>Adicionar caixas</h2><p>Selecione o arquivo .txt com quatro ou cinco campos separados por |: e-mail, senha, refresh token, client ID e, opcionalmente, e-mail de recuperação. Caixas já salvas mantêm sua autorização e seu histórico.</p><label>Arquivo de contas<input ref={fileInput} type="file" accept=".txt,text/plain" disabled={locked}/></label><button className={styles.primary} onClick={()=>void importFile()} disabled={locked}>Importar arquivo</button></section>:null}
  <nav className={styles.mobileJump} aria-label="Navegar pelo leitor"><a href="#mail-boxes">Caixas e filtros</a><a href="#mail-results">Códigos e ações · {selected.length} selecionadas</a></nav>
  <div className={styles.layout}><aside className={styles.sidebar} id="mail-boxes" tabIndex={-1}><div className={styles.sectionHeading}><h2>Suas caixas</h2><span>{filtered.length}</span></div><label className={styles.search}>Buscar e-mail<input placeholder="Digite parte do endereço" value={query} onChange={e=>{setQuery(e.target.value);if(enhanced)clearSelection();}}/></label>
  {enhanced?<details className={styles.filterPanel} open={!workbench||undefined}><summary>Filtros de caixas</summary><div className={styles.filters}><label>Mostrar<select aria-label="Mostrar" value={folder} onChange={e=>{setFolder(e.target.value as MailFolderView);clearSelection();}}><option value="active">Ativas</option><option value="archived">Arquivadas</option><option value="all">Todas</option></select></label><label>Situação da leitura<select aria-label="Situação da leitura" value={status} onChange={e=>{setStatus(e.target.value as MailStatusView);clearSelection();}}><option value="all">Todas as situações</option><option value="ok">Leitura confirmada</option><option value="attention">Precisam de atenção</option><option value="never">Nunca consultadas</option><option value="messages">Com mensagens salvas</option></select></label><label>Ordenar<select aria-label="Ordenar" value={sort} onChange={e=>{setSort(e.target.value as MailSort);clearSelection();}}><option value="newest">Últimas adicionadas</option><option value="email">E-mail A–Z</option><option value="checked">Última tentativa de consulta</option><option value="messages">Mais mensagens salvas</option></select></label><label>Histórico de códigos<select value={historyFilter} onChange={e=>{setHistoryFilter(e.target.value as MailHistoryView);clearSelection();}}><option value="all">Todos os históricos</option><option value="codes">Com códigos salvos</option><option value="no-codes">Zero códigos confirmados</option><option value="unknown">Códigos não informados</option></select></label>{workbench?<label>Origem<select value={sourceFilter} onChange={e=>{setSourceFilter(e.target.value);clearSelection();}}><option value="all">Todas as origens</option><option value="microsoft_graph">Microsoft · caixa de entrada</option><option value="mixotp">MixOTP · códigos do pedido</option></select></label>:null}</div></details>:null}
  <div className={styles.selection}><button disabled={busy} onClick={()=>changeSelection(selectMailPage(selected,visible))}>{enhanced?"Selecionar esta página":"Selecionar todas"}</button><button disabled={busy||!selected.length} onClick={clearSelection}>Limpar</button></div>
  {organization.enabled?<><div className={styles.organizeActions}><p>{selected.length} selecionada(s){offPage?` · ${offPage} fora desta página`:""}</p><button disabled={locked||!selected.length} onClick={()=>void openChange("archive")}>Arquivar seleção</button><button disabled={locked||!selected.length} onClick={()=>void openChange("restore")}>Restaurar seleção</button><button disabled={locked||selected.length!==1} onClick={()=>void openChange("delete")}>Excluir definitivamente…</button></div><p className={styles.muted}>{filtered.length} de {accounts.length} caixas nesta visualização.</p></>:null}
   <div className={styles.accounts}>{loading?<p role="status">Carregando caixas…</p>:!accounts.length?<p>Seu painel pessoal está vazio. Importe seu arquivo .txt para adicionar suas caixas.</p>:!filtered.length?<p>Nenhuma caixa corresponde aos filtros.</p>:visible.map(a=><label aria-label={"Selecionar caixa "+a.email} key={a.id} className={styles.account} data-selected={selected.includes(a.id)}><input type="checkbox" checked={selected.includes(a.id)} disabled={busy} onChange={e=>{changeSelection(e.target.checked?selectMailPage(selected,[a]):selected.filter(id=>id!==a.id));if(e.target.checked)setFocusId(a.id);}}/><span><strong>{a.email}</strong>{enhanced&&organization.entries[a.id]?.archived?<small>Arquivada</small>:null}<small>{accountStatus(a)}</small>{isMixOtp(a)?<small>MixOTP · somente códigos do pedido</small>:quickImport?<small>Microsoft · leitura da caixa</small>:null}<small>{enhanced?`${a.messages} mensagens salvas · Códigos: ${mailCodeCount(a)??"não informado"}`:`${a.messages} mensagem(ns) no histórico`}</small></span></label>)}</div>
  {enhanced?<nav className={styles.pagination} aria-label="Páginas de caixas"><div><span role="status">{accountPage.start}–{accountPage.end} de {filtered.length} resultados</span><label>Por página<select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1);}}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label></div><div><button disabled={accountPage.page===1} onClick={()=>setPage(accountPage.page-1)}>Anterior</button><span>Página {accountPage.page} de {accountPage.pages}</span><button disabled={accountPage.page===accountPage.pages} onClick={()=>setPage(accountPage.page+1)}>Próxima</button></div></nav>:null}
  </aside><section className={styles.results} id="mail-results" tabIndex={-1} aria-label="Códigos e histórico"><div className={styles.toolbar}><div><h2>Códigos e histórico</h2><p>{progress||(selected.some(id=>accounts.some(a=>a.id===id&&isMixOtp(a)))?"Consulte o fornecedor para buscar códigos dos pedidos selecionados.":"Atualize as caixas selecionadas para buscar novas mensagens.")}</p></div><div><button className={styles.primary} disabled={locked||!selected.length||unreadableSelection} onClick={()=>void refresh()}>{importing?"Importando…":busy?"Consultando…":"Atualizar seleção"}</button>{enhanced?<button disabled={busy||waiting||selected.length!==1||unreadableSelection} onClick={startWait}>Esperar novo código</button>:<button aria-pressed={auto} disabled={!selected.length} onClick={()=>setAuto(v=>!v)}>{auto?"Parar acompanhamento":"Acompanhar a cada 30s"}</button>}<button disabled={!selected.length||busy} onClick={download} title={hasMixOtp?"Somente histórico carregado nesta aba. MixOTP não fornece acesso Graph/Bot.":"Somente mensagens carregadas nesta aba; sem acesso API/Graph. Use o pacote Resolvbot para acesso e histórico completo salvo."}>Baixar histórico local (sem API)</button></div></div>
  {enhanced?<>
   <p className={styles.muted}>Selecione uma única caixa para esperar um novo código por até 2 minutos. A consulta se repete cerca de 1s após a anterior, respeitando os limites do serviço.</p>
   {waitState.phase!=="idle"?<section className={styles.waitPanel} aria-label="Espera de código" data-phase={waitState.phase}>
    <div><strong>{accounts.find(a=>a.id===waitState.accountId)?.email||"Caixa selecionada"}</strong><p role="status">{waitState.message}</p></div>
    <div className={styles.waitMeta}><span>{Math.max(0,Math.floor((Math.min(clockNow,waitState.deadlineAt)-waitState.startedAt)/1000))}s decorridos</span><span>{waitState.attempts} consulta(s)</span><span>{waiting?(waitState.nextAt?waitState.nextAt>=waitState.deadlineAt?"Limite do serviço excede esta espera":`Próxima consulta em ${Math.max(0,Math.ceil((waitState.nextAt-clockNow)/1000))}s`:"Consulta em andamento"):"Espera encerrada"}</span></div>
    {waiting?<button onClick={stopWait}>Parar espera</button>:<small>{waitState.phase==="found"?"Confira a nova mensagem abaixo.":"Confira o status da caixa antes de iniciar uma nova espera."}</small>}
   </section>:null}
   {selected.length>1&&(!workbench||view==="focus")?<label className={styles.historySearch}>Histórico em exibição · {selected.length} caixas selecionadas<select value={focused} onChange={e=>setFocusId(e.target.value)}>{selected.map(id=><option key={id} value={id}>{accounts.find(a=>a.id===id)?.email||id}</option>)}</select></label>:null}
  </>:null}
  {workbench?<div className={styles.workbenchControls}><div className={styles.viewModes} role="group" aria-label="Visualização do histórico"><button aria-pressed={view==="compare"} onClick={()=>setView("compare")}>Comparar caixas</button><button aria-pressed={view==="timeline"} onClick={()=>setView("timeline")}>Linha do tempo</button><button aria-pressed={view==="focus"} onClick={()=>setView("focus")}>Uma caixa</button></div><details className={styles.settings}><summary>Configurar visualização</summary><div><label>Ordem dos códigos<select value={historyOrder} onChange={e=>setHistoryOrder(e.target.value as MailHistoryOrder)}><option value="newest">Recentes primeiro</option><option value="oldest">Antigos primeiro</option></select></label><label>Fuso dos horários<select value={zone} onChange={e=>setZone(e.target.value as MailClockZone)}><option value="local">Deste dispositivo</option><option value="utc">UTC</option></select></label><label>Densidade<select value={density} onChange={e=>setDensity(e.target.value as "compact"|"comfortable")}><option value="compact">Compacta</option><option value="comfortable">Confortável</option></select></label></div></details><p className={styles.chronologyNote}>O destaque indica o horário mais recente conhecido, nunca a validade do código. Datas desconhecidas ficam ao final.</p></div>:null}
  {auto?<p className={styles.auto}>Acompanhamento ativo nesta aba enquanto estiver visível.</p>:null}
  {enhanced&&selected.length?<label className={styles.historySearch}>Buscar no histórico<input placeholder="Assunto, remetente ou código" value={historyQuery} onChange={e=>setHistoryQuery(e.target.value)}/></label>:null}
  {!selected.length?<div className={styles.empty}><span>✉</span><h3>{!loading&&!accounts.length?"Comece pelas suas caixas":"Escolha as caixas que deseja consultar"}</h3><p>{!loading&&!accounts.length?quickImport?"Use Importar arquivo para adicionar seu TXT. As caixas e o histórico deste painel pertencem ao seu login.":"Importe um arquivo .txt em Importar caixas. As caixas e o histórico deste painel pertencem ao seu login.":hasMixOtp?"Veja o histórico salvo sem fazer uma nova consulta ao fornecedor.":"O histórico salvo pode ser visto sem uma nova consulta à Microsoft."}</p>{!loading&&!accounts.length&&!quickImport?<button onClick={()=>setShowImport(true)}>Importar minhas caixas</button>:null}</div>:workbench&&view==="timeline"?<MailWorkbenchTimeline key={selected.join(",")+":"+historyQuery+":"+historyOrder+":"+zone} accounts={accounts.filter(a=>selected.includes(a.id))} messages={messages} query={historyQuery} zone={zone} order={historyOrder} copy={value=>void copy(value)}/>:<div className={workbench&&view==="compare"?styles.comparison:styles.singleHistory}>{displayed.map(id=>{const a=accounts.find(a=>a.id===id);if(!a)return null;return <article key={id} className={styles.mailbox}><header><div><span className={styles.sourceTag}>{isMixOtp(a)?"MixOTP · pedido":"Microsoft · caixa"}</span><h3>{a.email}</h3><p>{accountStatus(a)}<br/>Última tentativa: {date(a.checked)}{enhanced?<><br/>Histórico observado: {a.historyObservedAt?date(a.historyObservedAt):"não informado"}</>:null}</p></div><button aria-label={"Copiar e-mail "+a.email} onClick={()=>void copy(a.email)}>Copiar e-mail</button></header><CloudMailHistory key={id+":"+historyQuery+":"+historyOrder+":"+zone} messages={messages[id]||[]} loaded={Object.hasOwn(messages,id)} codeCount={mailCodeCount(a)} query={historyQuery} source={a.source} workbench={workbench} zone={zone} order={historyOrder} copy={value=>void copy(value)}/></article>;})}</div>}</section></div><footer className={styles.footer}>{hasMixOtp||quickImport?"Consulta de caixas Microsoft ou códigos de pedidos MixOTP. Nenhuma mensagem é enviada, movida ou apagada. Horários exibidos não garantem validade do código.":"Apenas leitura nas caixas Microsoft. Nenhuma mensagem é enviada, movida ou apagada. Horários indicam recebimento, não garantem validade do código."}</footer></div>
  <dialog ref={dialog} className={styles.dialog} onCancel={e=>{if(busy)e.preventDefault();else setChange(null);}} aria-labelledby="mail-change-title">
  {change?<><h2 id="mail-change-title">{change.operation==="archive"?"Arquivar caixas":change.operation==="restore"?"Restaurar caixas":"Excluir definitivamente"}</h2>
   {change.operation!=="delete"?<><p>{change.ids.length} caixa(s). {change.operation==="archive"?"Elas saem da lista ativa e podem ser restauradas. Histórico, credenciais e uso pelo bot serão preservados.":"Elas voltarão para sua lista ativa, com o histórico preservado."}</p><ul>{change.ids.map(id=><li key={id}>{accounts.find(a=>a.id===id)?.email}</li>)}</ul></>:<><p><strong>{change.preview?.email}</strong></p><p>A exclusão remove do seu painel pessoal as credenciais salvas e {change.preview?.messages} mensagem(ns) do histórico. Não apaga a conta na Microsoft e não pode ser desfeita.</p>{!change.preview?.deletionReady?<p role="status">A conferência de vínculos com o bot ainda não está disponível. A exclusão está bloqueada. Você pode arquivar sem perder os dados.</p>:<label>Digite o e-mail para confirmar<input autoComplete="off" value={confirmEmail} onChange={e=>setConfirmEmail(e.target.value)}/></label>}</>}
   {error?<p role="alert">{error}</p>:null}<div><button disabled={busy} onClick={()=>setChange(null)}>Cancelar</button><button className={styles.primary} disabled={busy||change.operation==="delete"&&(!change.preview?.deletionReady||confirmEmail.toLowerCase()!==change.preview.email.toLowerCase())} onClick={()=>void executeChange()}>{busy?"Salvando…":change.operation==="archive"?"Confirmar arquivamento":change.operation==="restore"?"Confirmar restauração":"Excluir sem recuperação"}</button></div></>:null}
  </dialog>
 </main>;
}
