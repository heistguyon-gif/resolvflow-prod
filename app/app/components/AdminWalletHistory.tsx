"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import type {WalletHistoryPage} from "../../lib/admin-wallet-history";
import {formatAdminDateTime} from "../lib/adminDateTime";
import styles from "./AdminWalletHistory.module.css";
const money=(value:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value/100);
const nullableText=(value:unknown)=>value===null||typeof value==="string";
function validPage(value:WalletHistoryPage){
  return value&&Array.isArray(value.items)&&value.items.every(item=>item&&typeof item.id==="string"&&["credit_manual","debit_manual"].includes(item.type)&&Number.isFinite(item.amountCents)&&Number.isFinite(item.balanceAfterCents)&&typeof item.summary==="string"&&typeof item.createdAt==="string"&&item.recipient&&typeof item.recipient.id==="string"&&nullableText(item.recipient.name)&&nullableText(item.recipient.email)&&item.actor&&typeof item.actor.id==="string"&&nullableText(item.actor.name)&&nullableText(item.actor.email)&&item.workspace&&typeof item.workspace.id==="string"&&nullableText(item.workspace.name))&&value.totals&&[value.totals.count,value.totals.creditCents,value.totals.debitCents,value.totals.netCents].every(Number.isFinite)&&(value.nextCursor===null||typeof value.nextCursor==="string");
}
export function AdminWalletHistory({from,to,allPeriod,query,onQueryChange,refreshVersion}:{from:string;to:string;allPeriod:boolean;query:string;onQueryChange:(value:string)=>void;refreshVersion:number}){
  const [kind,setKind]=useState("credit"),[snapshot,setSnapshot]=useState<{key:string;page:WalletHistoryPage}|null>(null),[activity,setActivity]=useState({key:"",loading:true,error:""});
  const sequence=useRef(0),busy=useRef(false),request=useRef<AbortController|null>(null);
  const params=new URLSearchParams({kind,q:query.trim()});if(!allPeriod){params.set("from",from);params.set("to",to);}
  const key=params.toString(),page=snapshot?.key===key?snapshot.page:null,loading=activity.key!==key||activity.loading,error=activity.key===key?activity.error:"";
  const read=useCallback(async(append=false,cursor?:string)=>{
    if(append&&busy.current)return;
    request.current?.abort();const controller=new AbortController();request.current=controller;
    const version=++sequence.current;busy.current=true;setActivity({key,loading:true,error:""});
    try{
      const response=await fetch(`/api/admin/wallet-history?${key}${cursor?`&cursor=${encodeURIComponent(cursor)}`:""}`,{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});
      const body=await response.json() as WalletHistoryPage&{error?:string};
      if(!response.ok)throw new Error(typeof body?.error==="string"?body.error:"Não foi possível carregar o histórico de saldo.");
      if(!validPage(body))throw new Error("A resposta do histórico está incompleta. Tente atualizar.");
      if(version!==sequence.current)return;
      setSnapshot(previous=>{
        if(!append||previous?.key!==key)return {key,page:body};
        const known=new Set(previous.page.items.map(item=>item.id));
        return {key,page:{...body,items:[...previous.page.items,...body.items.filter(item=>!known.has(item.id))]}};
      });
    }catch(cause){if(version===sequence.current)setActivity({key,loading:false,error:cause instanceof Error&&cause.name!=="AbortError"?cause.message:"Não foi possível carregar o histórico de saldo."});}
    finally{if(version===sequence.current){busy.current=false;setActivity(previous=>({...previous,loading:false}));}}
  },[key]);
  const invalidate=useCallback(()=>{sequence.current++;busy.current=false;request.current?.abort();},[]);
  useEffect(()=>{const timer=window.setTimeout(()=>void read(),0);return()=>{window.clearTimeout(timer);invalidate();};},[read,refreshVersion,invalidate]);
  return <div className={styles.history}>
    <section className={`panel ${styles.filters}`} aria-label="Filtros do histórico de saldo"><label>Movimentação<select value={kind} onChange={event=>setKind(event.target.value)}><option value="credit">Adições manuais</option><option value="debit">Retiradas manuais</option><option value="all">Adições e retiradas</option></select></label><label>Buscar usuário ou workspace<input value={query} onChange={event=>onQueryChange(event.target.value)} maxLength={100} placeholder="Nome, e-mail ou workspace" type="search"/></label><p>Somente ajustes manuais registrados. PIX, compras e devoluções ficam fora desta consulta.</p></section>
    {error?<div className="operation-banner error" role="alert">{error}{page?" Os dados anteriores deste filtro continuam exibidos.":""} <button type="button" className="text-button" onClick={()=>void read()}>Tentar novamente</button></div>:null}
    {loading?<p className={styles.status} role="status">{page?"Atualizando histórico…":"Carregando histórico…"}</p>:null}
    {page?<>
      <section className="metric-grid" aria-label="Totais do histórico">{[["Adições manuais",money(page.totals.creditCents)],["Retiradas manuais",money(page.totals.debitCents)],["Variação no filtro",money(page.totals.netCents)],["Lançamentos",String(page.totals.count)]].map(([label,value])=><article className="metric-card" key={label}><div className="metric-top"><span>{label}</span></div><strong>{value}</strong><span className="metric-note">Todos os registros nos filtros selecionados</span></article>)}</section>
      <section className={`panel ${styles.list}`} aria-label="Lançamentos de saldo"><div className="panel-heading"><div><span className="panel-kicker">Registro financeiro</span><h2>Ajustes manuais de saldo</h2></div><span className="date-pill">{page.items.length} de {page.totals.count}</span></div>
        {!page.items.length?<p className={styles.status}>Nenhum ajuste manual encontrado nos filtros selecionados.</p>:<ol>{page.items.map(item=><li key={item.id} data-ledger-id={item.id}><div><span>Destinatário</span><strong>{item.recipient.name||item.recipient.email||"Identidade indisponível"}</strong>{item.recipient.email?<small>{item.recipient.email}</small>:null}<small>Workspace: {item.workspace.name||"Nome indisponível"}</small></div><div><span>Responsável registrado</span><strong>{item.actor.name||item.actor.email||"Identidade indisponível"}</strong>{item.actor.email?<small>{item.actor.email}</small>:null}</div><div><span>Data</span><strong>{formatAdminDateTime(item.createdAt,"Data indisponível")}</strong><small>{item.type==="credit_manual"?"Adição manual":"Retirada manual"}</small></div><div><span>Valor registrado</span><strong className={item.amountCents<0?styles.negative:styles.positive}>{money(item.amountCents)}</strong><small>Saldo após: {money(item.balanceAfterCents)}</small></div><div><span>Descrição registrada</span><p>{item.summary||"Sem descrição registrada."}</p><details><summary>Detalhes do lançamento</summary><small>ID do lançamento: {item.id}</small><small>ID da carteira: {item.workspace.id}</small><small>ID do responsável: {item.actor.id}</small></details></div></li>)}</ol>}
        {page.nextCursor?<button type="button" className="outline-button" disabled={loading} onClick={()=>void read(true,page.nextCursor!)}>Carregar mais lançamentos</button>:null}
      </section>
    </>:null}
  </div>;
}
