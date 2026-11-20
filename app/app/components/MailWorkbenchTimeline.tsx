"use client";
import {useState} from "react";
import {MailCodeRecord} from "./CloudMailHistory";
import {mailAccountPage} from "./cloudMailFilters";
import {mailTimeline,type MailClockZone,type MailHistoryOrder,type TimelineAccount,type WorkbenchMessage} from "./mailWorkbenchView";
import styles from "./CloudMailReader.module.css";
export function MailWorkbenchTimeline({accounts,messages,query,zone,order,copy}:{accounts:TimelineAccount[];messages:Record<string,WorkbenchMessage[]>;query:string;zone:MailClockZone;order:MailHistoryOrder;copy(value:string):void}){
 const [page,setPage]=useState(1),entries=mailTimeline(accounts,messages,query,order),view=mailAccountPage(entries,page,12);
 const fullHistory=mailTimeline(accounts,messages);
 const latest=fullHistory.reduce<number|null>((max,item)=>item.time.epochMs===null?max:max===null?item.time.epochMs:Math.max(max,item.time.epochMs),null);
 const ties=fullHistory.filter(entry=>latest!==null&&entry.time.epochMs===latest).length;
 const loaded=accounts.filter(account=>Object.hasOwn(messages,account.id)).length;
 return <section className={styles.timeline} aria-label="Linha do tempo entre caixas"><div className={styles.timelineHeading}><h3>Linha do tempo</h3><p role="status">{loaded} de {accounts.length} históricos carregados · {entries.length} códigos nesta busca</p></div><p className={styles.muted}>Ordem pelo horário conhecido de cada origem. Observado no fornecedor não significa recebido na caixa. Registros sem data ficam ao final.</p>
  {!entries.length?<p role="status">{loaded<accounts.length?"Carregando históricos selecionados…":"Nenhum código corresponde à visualização."}</p>:view.items.map(entry=><article key={entry.account.id+":"+entry.message.id} className={styles.timelineEntry}><h4>{entry.account.email}<span>{entry.account.source==="mixotp"?"MixOTP · observado":"Microsoft · recebido"}</span></h4><MailCodeRecord message={entry.message} source={entry.account.source} zone={zone} latest={latest!==null&&entry.time.epochMs===latest} tied={ties>1} copy={copy}/></article>)}
  {entries.length>12?<nav className={styles.pagination} aria-label="Páginas da linha do tempo"><button disabled={view.page===1} onClick={()=>setPage(view.page-1)}>Anteriores</button><span>{view.start}–{view.end} de {entries.length}</span><button disabled={view.page===view.pages} onClick={()=>setPage(view.page+1)}>Próximos</button></nav>:null}
 </section>;
}
