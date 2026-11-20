"use client";
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from "react";
import type {PurchaseItem} from "../lib/otpPurchasePresentation";

export type OtpPurchase = {operationId:string;requestId:string;status:string;ordered:number;requested:number;failed:number;pending:number;charged_cents:number;reserved_cents:number;refunded_cents:number;needsReview:boolean;canContinue:boolean;cancelled?:boolean;cancelRequested?:boolean;state?:string;createdAt?:string;reviewRequestedAt?:string;items?:PurchaseItem[]};
export type GmailSourceMode="automatic"|"supplier_1"|"supplier_2";
type Intent={requestId:string;quantity:number;sourceMode?:GmailSourceMode};

async function api<T>(url:string,body?:unknown):Promise<T> {
  const response=await fetch(url,{credentials:"same-origin",cache:"no-store",signal:AbortSignal.timeout(90000),...(body ? {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)} : {})});
  const payload=await response.json() as T & {error?:string};
  if (!response.ok) throw Object.assign(new Error(payload.error||"Não foi possível conferir o pedido."),{status:response.status});
  return payload;
}

export function useOtpPurchases(enabled:boolean,accountId:string,onChange:()=>Promise<unknown>) {
  const [operations,setOperations]=useState<OtpPurchase[]>([]);
  const [recent,setRecent]=useState<OtpPurchase[]>([]);
  const [unconfirmed,setUnconfirmed]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [working,setWorking]=useState(false);
  const refreshNow=useRef<null|(()=>Promise<void>)>(null);
  const resuming=useRef(new Set<string>());
  const pendingCancellation=useRef(new Map<string,string>());
  const lastState=useRef("");
  const revision=useRef(0);
  const inFlight=useRef(false),refreshing=useRef(false),intents=useRef<Intent[]>([]);
  const scope=`resolvflow.otp.purchase.${accountId}`;
  const currentScope=useRef(scope),flightScope=useRef(""),refreshScope=useRef("");
  useLayoutEffect(()=>{currentScope.current=scope;},[scope]);
  const save=useCallback((value:Intent[])=>{
    if(currentScope.current!==scope)return;
    intents.current=value;setUnconfirmed(value.length>0);
    try {if(value.length)sessionStorage.setItem(scope,JSON.stringify(value));else sessionStorage.removeItem(scope);} catch {/* Server operations still survive a page reload. */}
  },[scope]);
  const receive=useCallback(async(result:OtpPurchase)=>{
    if(currentScope.current!==scope)return;
    save(intents.current.filter(item=>item.requestId!==result.requestId));
    setOperations(previous=>result.pending ? [result,...previous.filter(item=>item.operationId!==result.operationId)] : previous.filter(item=>item.operationId!==result.operationId));
    if(!result.pending)setRecent(previous=>[result,...previous.filter(item=>item.operationId!==result.operationId)].slice(0,10));
    if(result.pending&&result.cancelRequested){pendingCancellation.current.set(scope,result.operationId);setNotice("Cancelamento solicitado. A compra em andamento ainda precisa de confirma\u00e7\u00e3o; nenhum novo item ser\u00e1 iniciado.");}
    if (!result.pending) {
      if(pendingCancellation.current.get(scope)===result.operationId)pendingCancellation.current.delete(scope);
      const refund=result.refunded_cents ? ` Crédito devolvido: ${(result.refunded_cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}.` : "";
      const outcome=result.state==="unconfirmed_refunded"
        ? `Pedido encerrado: não foi possível confirmar a entrega.${result.ordered ? ` ${result.ordered} Gmail(s) entregue(s) preservado(s).` : ""}`
        : result.cancelled ? `Pendentes cancelados. ${result.ordered} Gmail(s) já entregue(s) preservado(s).`
        : result.ordered ? `${result.ordered} de ${result.requested} Gmail(s) entregue(s).`
        : result.state==="out_of_stock" ? "Sem estoque no fornecedor agora." : "Não foi possível concluir a compra.";
      setNotice(outcome+refund);
    }
    void onChange().catch(()=>undefined);
  },[onChange,save,scope]);
  const submit=useCallback(async(current:Intent)=>{
    if(inFlight.current&&flightScope.current===scope)return;
    inFlight.current=true;flightScope.current=scope;revision.current++;setWorking(true);setError("");setNotice("");
    if(!intents.current.some(item=>item.requestId===current.requestId))save([...intents.current,current]);
    try {await receive(await api<OtpPurchase>("/api/otp",{action:"order",product:"ig_gmail_otp",quantity:current.quantity,requestId:current.requestId,...(current.sourceMode?{sourceMode:current.sourceMode}:{})}));}
    catch(cause){
      if(currentScope.current!==scope)return;
      if(cause && typeof cause==="object" && "status" in cause && [400,402,403].includes(Number(cause.status)))save(intents.current.filter(item=>item.requestId!==current.requestId));
      setError(cause instanceof Error ? cause.message : "Conexão interrompida. Confira o mesmo pedido antes de solicitar outro.");
    } finally {if(flightScope.current===scope){inFlight.current=false;if(currentScope.current===scope){setWorking(false);void onChange().catch(()=>undefined);void refreshNow.current?.();}}}
  },[receive,save,onChange,scope]);
  const start=useCallback((quantity:number,sourceMode?:GmailSourceMode)=>submit({requestId:crypto.randomUUID(),quantity,...(sourceMode?{sourceMode}:{})}),[submit]);
  const retry=useCallback(async()=>{const current=intents.current[0];if(current)await submit(current);},[submit]);
  const update=useCallback(async(operationId:string,action:"cancel")=>{
    if(inFlight.current&&flightScope.current===scope)return;
    inFlight.current=true;flightScope.current=scope;revision.current++;setWorking(true);setError("");setNotice("");
    try {await receive(await api<OtpPurchase>("/api/otp/operations",{action,operationId}));}
    catch(cause){if(currentScope.current===scope)setError(cause instanceof Error?cause.message:"Não foi possível atualizar o pedido.");}
    finally{if(flightScope.current===scope){inFlight.current=false;if(currentScope.current===scope){setWorking(false);void onChange().catch(()=>undefined);void refreshNow.current?.();}}}
  },[receive,onChange,scope]);

  useEffect(()=>{
    let active=true;
    intents.current=[];
    lastState.current="";
    queueMicrotask(()=>{if(active){setUnconfirmed(false);setOperations([]);setRecent([]);setError("");setNotice("");setWorking(inFlight.current&&flightScope.current===scope);}});
    if(!enabled||!accountId)return()=>{active=false;};
    try {
      const stored=JSON.parse(sessionStorage.getItem(scope)||"null") as Intent|Intent[]|null;
      const values=Array.isArray(stored)?stored:stored?[stored]:[];
      intents.current=values.filter(item=>item&&/^[a-f0-9-]{36}$/i.test(item.requestId)&&Number.isInteger(item.quantity)&&item.quantity>=1&&item.quantity<=13&&(item.sourceMode===undefined||["automatic","supplier_1","supplier_2"].includes(item.sourceMode)));
      if(intents.current.length)queueMicrotask(()=>{if(active)setUnconfirmed(true);});
    } catch {/* Ignore an invalid local draft. */}
    let refreshQueued=false,historyReading=false,historyQueued=false;
    const refreshHistory=async(version:number)=>{
      if(!active||document.hidden)return;
      if(historyReading){historyQueued=true;return;}
      historyReading=true;historyQueued=false;
      try{
        const history=await api<{operations:OtpPurchase[]}>("/api/otp/operations?recent=1");
        if(!active||inFlight.current&&flightScope.current===scope||version!==revision.current)return;
        setRecent(history.operations.filter(item=>!item.pending).slice(0,10));
        const cancelled=history.operations.find(item=>!item.pending&&item.operationId===pendingCancellation.current.get(scope));
        if(cancelled)await receive(cancelled);
      }catch(cause){if(active&&version===revision.current)setError(cause instanceof Error?cause.message:"Não foi possível conferir o histórico.");}
      finally{historyReading=false;if(active&&historyQueued&&!document.hidden)void refreshHistory(revision.current);}
    };
    const launchResume=(next:OtpPurchase,version:number)=>{
      if(!active||version!==revision.current||document.hidden||!next.canContinue||resuming.current.has(scope)||inFlight.current&&flightScope.current===scope)return;
      resuming.current.add(scope);
      void(async()=>{
        let follow:OtpPurchase|undefined;let followVersion=version;let definitiveProgress=false;
        try{
          const updated=await api<OtpPurchase>("/api/otp",{action:"resume",operationId:next.operationId});
          definitiveProgress=updated.operationId===next.operationId&&(updated.ordered>next.ordered||updated.failed>next.failed);
          if(active&&version===revision.current){
            followVersion=++revision.current;
            await receive(updated);
            if(active&&followVersion===revision.current&&updated.pending&&updated.canContinue&&!updated.cancelRequested&&(updated.ordered>next.ordered||updated.failed>next.failed))follow=updated;
          }
        }catch(cause){if(active&&version===revision.current)setError(cause instanceof Error?cause.message:"N\u00e3o foi poss\u00edvel conferir o pedido.");}
        finally{resuming.current.delete(scope);if(follow)launchResume(follow,followVersion);else if(definitiveProgress&&currentScope.current===scope)void refreshNow.current?.();}
      })();
    };
    const refresh=async()=>{
      if(document.hidden||inFlight.current&&flightScope.current===scope||refreshing.current&&refreshScope.current===scope)return;
      refreshQueued=false;refreshing.current=true;refreshScope.current=scope;
      const version=revision.current;
      try {
        const result=await api<{operations:OtpPurchase[]}>("/api/otp/operations");
        if(!active||inFlight.current&&flightScope.current===scope||version!==revision.current)return;
        setOperations(result.operations);
        const next=result.operations.find(item=>item.canContinue);
        if(next)launchResume(next,version);
        const signature=JSON.stringify(result.operations);
        if(signature!==lastState.current){
          lastState.current=signature;void onChange().catch(()=>undefined);
          void refreshHistory(version);
        }
        save(intents.current.filter(item=>!result.operations.some(operation=>operation.requestId===item.requestId)));
        if(!next) {
          // A lost HTTP response must not require the customer to open a manual
          // review. Recover the original request identity, never create a new one.
          const intent=intents.current[0];
          if(intent){
            try {
              const updated=await api<OtpPurchase>("/api/otp",{action:"order",product:"ig_gmail_otp",quantity:intent.quantity,requestId:intent.requestId,...(intent.sourceMode?{sourceMode:intent.sourceMode}:{})});
              if(active&&version===revision.current)await receive(updated);
            } catch(cause) {
              if(active&&version===revision.current&&cause&&typeof cause==="object"&&"status" in cause&&[400,402,403].includes(Number(cause.status)))save(intents.current.filter(item=>item.requestId!==intent.requestId));
              throw cause;
            }
          }
        }
      } catch(cause){if(active&&version===revision.current)setError(cause instanceof Error ? cause.message : "Não foi possível conferir os pedidos.");}
      finally {if(refreshScope.current===scope)refreshing.current=false;if(active&&refreshQueued&&!document.hidden&&!(inFlight.current&&flightScope.current===scope))queueMicrotask(()=>void refresh());}
    };
    const requestRefresh=async()=>{refreshQueued=true;await refresh();};
    refreshNow.current=requestRefresh;
    void refresh();const timer=window.setInterval(()=>void refresh(),5000);
    const visible=()=>{if(!document.hidden)void requestRefresh();};document.addEventListener("visibilitychange",visible);
    return()=>{active=false;if(refreshNow.current===requestRefresh)refreshNow.current=null;window.clearInterval(timer);document.removeEventListener("visibilitychange",visible);};
  },[enabled,accountId,scope,save,receive,onChange]);
  // Old pending/uncertain operations never lock the customer's next purchase.
  // Unconfirmed submissions retain their own request IDs for explicit recovery.
  return {operations,recent,unconfirmed,error,notice,start,retry,cancel:(id:string)=>update(id,"cancel"),blocked:working};
}
