"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {providerName,purchaseReason,traceSummary} from "../lib/otpAdminPurchasePresentation";

type Review={id:string;kind?:"durable";item_index?:number;operation_id:string;account_user_id:string;workspace_owner_user_id:string;provider:string;unit_cents:number;requested_at:string;account_email?:string;account_name?:string;warehouse?:number;code?:string;attempts?:number;settlementPending?:boolean;review_requested?:boolean;trace?:Array<{provider:string;warehouse:number;stage:string;code:string;status?:number}>};
export default function AdminOtpReconciliation() {
  const [items,setItems]=useState<Review[]>([]),[enabled,setEnabled]=useState(false),[selected,setSelected]=useState<Review|null>(null);
  const [orderId,setOrderId]=useState(""),[note,setNote]=useState(""),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [cursor,setCursor]=useState<string|null>(null),busyRef=useRef(false),readVersion=useRef(0);
  const load=useCallback(async(next?:string)=>{
    const version=++readVersion.current;
    const response=await fetch(`/api/admin/otp/operations${next?`?cursor=${encodeURIComponent(next)}`:""}`,{cache:"no-store",signal:AbortSignal.timeout(30000)});
    const body=await response.json() as {enabled:boolean;items:Review[];cursor?:string|null;error?:string};
    if(!response.ok||body.enabled!==true||!Array.isArray(body.items)||body.items.some(item=>!item||typeof item.id!=="string"||typeof item.operation_id!=="string"))throw new Error(body.error||"Não foi possível carregar a conferência.");
    if(version!==readVersion.current)return;
    setItems(previous=>next?[...previous,...body.items.filter(item=>!previous.some(old=>old.id===item.id))]:body.items);setEnabled(body.enabled);setCursor(body.cursor||null);
  },[]);
  useEffect(()=>{const first=window.setTimeout(()=>void load().catch(cause=>setError(cause.message)),0);const timer=window.setInterval(()=>{if(!document.hidden)void load().catch(()=>{});},30_000);return()=>{window.clearTimeout(first);window.clearInterval(timer);};},[load]);
  async function resolve(action:"deliver"|"refund") {
    if(!selected||busyRef.current)return;busyRef.current=true;setBusy(true);setError("");
    try {
      const response=await fetch("/api/admin/otp/operations",{method:"POST",headers:{"content-type":"application/json"},signal:AbortSignal.timeout(30000),body:JSON.stringify({itemId:selected.id,action,orderId,note,confirmedNoDelivery:confirmed})});
      const body=await response.json() as {ok?:boolean;error?:string};if(!response.ok||body.ok!==true)throw new Error(body.error||"Resposta sem confirmação. Atualize e confira o mesmo item antes de repetir.");
      setSelected(null);await load();
    } catch(cause){setError(cause instanceof Error ? cause.message : "Não foi possível concluir. Atualize e confira o mesmo item antes de repetir.");}finally{busyRef.current=false;setBusy(false);}
  }
  if(!enabled&&!error)return null;
  return <section className="panel otp-reconciliation" aria-labelledby="otp-reconciliation-title"><header><div><span className="panel-kicker">Pedidos interrompidos</span><h3 id="otp-reconciliation-title">Conferência de Gmail</h3><p>Vincule um pedido confirmado ou devolva a reserva após conferir a ausência de entrega.</p></div><button type="button" className="outline-button" disabled={busy} onClick={()=>void load().catch(cause=>setError(cause.message))}>Atualizar</button></header>
    {error ? <p className="operation-banner error" role="alert">{error}</p> : null}
    {!items.length ? <p>Nenhum pedido nesta página aguardando conferência.</p> : <div className="otp-review-list">{items.map(item=><article key={item.id}><div><strong>{item.account_name||item.account_email||item.account_user_id}</strong><small>Pedido {item.operation_id.slice(0,8)} · {item.provider==="otpgmail" ? "OTPGmail" : "InstaCaster"} · {new Date(item.requested_at.endsWith("Z")?item.requested_at:item.requested_at+"Z").toLocaleString("pt-BR")} · {(item.unit_cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})} reservados{item.review_requested?" · Conferência solicitada pelo cliente":""}</small></div><button type="button" className="outline-button" disabled={busy} onClick={()=>{setSelected(item);setOrderId("");setNote("");setConfirmed(false);}}>Conferir</button></article>)}</div>}
    {cursor ? <button type="button" className="outline-button" disabled={busy} onClick={()=>void load(cursor).catch(cause=>setError(cause.message))}>Carregar próxima página</button> : null}
    {selected ? <form className="otp-review-form" onSubmit={event=>{event.preventDefault();if(selected.kind!=="durable")void resolve("deliver");}}><strong>Pedido {selected.operation_id.slice(0,8)}{selected.kind==="durable"?` · Item ${(selected.item_index??0)+1}`:""}</strong>
      {selected.kind==="durable" ? <div><p>{providerName(selected.provider)}{selected.provider==="otpgmail"?` · armazém ${selected.warehouse}`:""} · {selected.attempts} tentativa(s) · {purchaseReason(selected.code)}. {selected.settlementPending?"Decisão registrada; conclua a devolução deste item.":"Confira a ausência de entrega antes de encerrar. Entregas de outros itens serão preservadas."}</p><p>Vinculação manual de entrega indisponível neste pedido.</p>{selected.trace?.length ? <ul>{selected.trace.map((step,i)=><li key={i}>{traceSummary(step)}{step.status?` · HTTP ${step.status}`:""}</li>)}</ul> : <p>Trajeto anterior não registrado.</p>}</div> : <label>Pedido confirmado no fornecedor<input value={orderId} onChange={event=>setOrderId(event.target.value)} placeholder="Identificador do pedido já comprado" autoComplete="off" /></label>}
      <label>Resultado da conferência<textarea value={note} onChange={event=>setNote(event.target.value)} minLength={10} maxLength={1000} required placeholder="Descreva o que foi conferido, sem senhas ou chaves de API" /></label><div className="otp-review-actions">{selected.kind!=="durable" ? <button type="submit" className="primary-button" disabled={busy||!orderId.trim()||note.trim().length<10}>Vincular Gmail confirmado</button> : null}<button type="button" className="outline-button" disabled={busy} onClick={()=>setSelected(null)}>Fechar</button></div><label className="otp-review-confirm"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} />Conferi no fornecedor que este item não entregou nenhum Gmail.</label><button type="button" className="outline-button" disabled={busy||!confirmed||note.trim().length<10} onClick={()=>void resolve("refund")}>{selected.settlementPending?"Concluir devolução registrada":"Encerrar item e devolver reserva"}</button></form> : null}
  </section>;
}
