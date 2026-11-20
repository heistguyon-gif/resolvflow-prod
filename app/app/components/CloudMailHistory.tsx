"use client";
import { useState } from "react";
import { mailAccountPage } from "./cloudMailFilters";
import { mailEventTime } from "../../lib/cloud-mail-chronology";
import { mailTimeLabel, matchesMailHistory, orderedMailHistory, type MailClockZone, type MailHistoryOrder, type WorkbenchMessage } from "./mailWorkbenchView";
import styles from "./CloudMailReader.module.css";
export type ReaderMessage = WorkbenchMessage;
export function MailCodeRecord({message,source,zone="local",latest=false,tied=false,copy}:{message:ReaderMessage;source?:string;zone?:MailClockZone;latest?:boolean;tied?:boolean;copy(value:string):void}){
 const stamp=mailTimeLabel(message,source,zone);
 return <div className={styles.code} data-latest={latest}>
  <div><span>{latest?(tied?"Mais recentes · mesmo horário":"Mais recente com data conhecida"):stamp.value?"Histórico":"Data desconhecida"}</span><strong>{message.code}</strong><small>{stamp.label} {stamp.value?<time dateTime={stamp.value}>{stamp.text}</time>:stamp.text}</small>{source!=="mixotp"?<small>{message.subject||"Sem assunto"} · {message.folder==="inbox"?"Entrada":message.folder==="spam"?"Spam":message.folder}</small>:<small>MixOTP · observação do fornecedor, não recebimento</small>}<small>Histórico salvo · a posição não garante validade do código.</small></div>
  <button aria-label={"Copiar código "+(stamp.value?stamp.label.toLowerCase()+" "+stamp.text:"sem data informada")} onClick={()=>copy(message.code!)}>Copiar código</button>
 </div>;
}
export function CloudMailHistory({messages,loaded,codeCount,query,copy,source="microsoft_graph",workbench=false,zone="local",order="newest"}:{messages:ReaderMessage[];loaded:boolean;codeCount:number|null;query:string;copy(value:string):void;source?:string;workbench?:boolean;zone?:MailClockZone;order?:MailHistoryOrder}){
 const [codePage,setCodePage]=useState(1),[messagePage,setMessagePage]=useState(1);
 const matched=orderedMailHistory(messages,source,order).filter(message=>matchesMailHistory(message,query));
 const codes=matched.filter(message=>message.code),codeView=mailAccountPage(codes,codePage,4),messageView=mailAccountPage(matched,messagePage,10);
 const latest=messages.filter(message=>message.code).reduce<number|null>((max,message)=>{const at=mailEventTime(message,source).epochMs;return at===null?max:max===null?at:Math.max(max,at);},null);
 const ties=latest===null?0:messages.filter(message=>message.code&&mailEventTime(message,source).epochMs===latest).length;
 return <>
  {source==="mixotp"?<p className={styles.muted}>MixOTP · códigos do pedido. Data de observação não comprova recebimento de e-mail. Sem inbox Microsoft ou acesso Graph/Bot.</p>:null}
  <div className={styles.historyCounts}><span><strong>{loaded?matched.length:"—"}</strong> {source==="mixotp"?"registros salvos":"mensagens salvas"}{query.trim()?" encontrados":""}</span><span>Códigos: <strong>{loaded&&codeCount!==null?codes.length:"não informado"}</strong></span>{workbench?<span>{order==="newest"?"Recentes primeiro":"Antigos primeiro"} · {zone==="utc"?"UTC":"fuso deste dispositivo"}</span>:null}</div>
  {!loaded?<p className={styles.muted} role="status">Carregando histórico salvo…</p>:!codes.length?<p className={styles.muted}>{query.trim()?"Nenhum código corresponde à busca.":codeCount===null?"Códigos ainda não informados. Histórico vazio não confirma zero recebimentos.":"Nenhum código identificado no histórico salvo."}</p>:<div className={styles.codes}>{codeView.items.map(message=><MailCodeRecord key={message.id} message={message} source={source} zone={zone} latest={latest!==null&&mailEventTime(message,source).epochMs===latest} tied={ties>1} copy={copy}/>)}</div>}
  {codes.length>4?<nav className={styles.pagination} aria-label="Páginas de códigos"><button disabled={codeView.page===1} onClick={()=>setCodePage(codeView.page-1)}>Códigos anteriores</button><span>{codeView.start}–{codeView.end} de {codes.length}</span><button disabled={codeView.page===codeView.pages} onClick={()=>setCodePage(codeView.page+1)}>Próximos códigos</button></nav>:null}
  {source!=="mixotp"?<details><summary>Ver remetentes e assuntos · {loaded?matched.length:"—"} mensagens</summary>{messageView.items.map(message=>{const stamp=mailTimeLabel(message,source,zone);return <div className={styles.message} key={message.id}><strong>{message.subject||"Sem assunto"}</strong><span>{message.sender}</span><small>{stamp.label} {stamp.text}</small></div>;})}{matched.length>10?<nav className={styles.pagination} aria-label="Páginas de mensagens"><button disabled={messageView.page===1} onClick={()=>setMessagePage(messageView.page-1)}>Mensagens anteriores</button><span>{messageView.start}–{messageView.end} de {matched.length}</span><button disabled={messageView.page===messageView.pages} onClick={()=>setMessagePage(messageView.page+1)}>Próximas mensagens</button></nav>:null}</details>:null}
 </>;
}
