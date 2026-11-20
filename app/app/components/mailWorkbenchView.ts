import { mailEventTime, sortMailEvents } from "../../lib/cloud-mail-chronology";
export type MailClockZone = "local" | "utc";
export type MailHistoryOrder = "newest" | "oldest";
export type WorkbenchMessage = {id:string;sender:string;subject:string;receivedAt:string;observedAt?:string;folder:string;code:string|null};
export type TimelineAccount = {id:string;email:string;source?:string};
export function mailTimeLabel(message:WorkbenchMessage,source?:string,zone:MailClockZone="local"){
 const time=mailEventTime(message,source);
 if(time.epochMs===null)return {label:source==="mixotp"?"Observado em":"Recebido em",text:"— · data não informada",value:null};
 return {label:time.kind==="observed"?"Observado em":"Recebido em",value:time.value,text:new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23",timeZone:zone==="utc"?"UTC":undefined,timeZoneName:"short"}).format(time.epochMs)};
}
export function orderedMailHistory(messages:readonly WorkbenchMessage[],source?:string,order:MailHistoryOrder="newest"){
 const sorted=sortMailEvents(messages,source);
 if(order==="oldest")sorted.sort((a,b)=>{const at=mailEventTime(a,source).epochMs,bt=mailEventTime(b,source).epochMs;return at!==bt?(at===null?1:bt===null?-1:at-bt):(a.id<b.id?-1:a.id>b.id?1:0);});
 return sorted;
}
export function matchesMailHistory(message:WorkbenchMessage,query:string){return [message.sender,message.subject,message.code??""].some(value=>value.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR")));}
export function mailTimeline(accounts:readonly TimelineAccount[],messages:Record<string,WorkbenchMessage[]>,query="",order:MailHistoryOrder="newest"){
 return accounts.flatMap(account=>(messages[account.id]??[]).filter(message=>message.code&&matchesMailHistory(message,query)).map(message=>({account,message,time:mailEventTime(message,account.source)})))
  .sort((a,b)=>{const at=a.time.epochMs,bt=b.time.epochMs;if(at!==bt)return at===null?1:bt===null?-1:order==="oldest"?at-bt:bt-at;const ak=a.account.id+":"+a.message.id,bk=b.account.id+":"+b.message.id;return ak<bk?-1:ak>bk?1:0;});
}
