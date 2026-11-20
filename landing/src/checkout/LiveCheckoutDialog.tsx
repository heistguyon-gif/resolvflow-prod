import { toDataURL } from 'qrcode';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CATALOG_VERSION, CHECKOUT_SUPPORT_EMAIL, CHECKOUT_TERMS, TERMS_VERSION, PILOT_ACK_VERSION, PILOT_EMAIL, PILOT_ACK, PILOT_PATH, type FIXED_PLANS } from './catalog';

type Plan = typeof FIXED_PLANS[number];
type Receipt = { id:string; plan:Plan; currency:'BRL'; status:string; pix:{copyPaste:string;expiresAt:string}|null; fulfillment:string };
type Props = { plan:Plan; returnFocus:HTMLButtonElement|null; close:()=>void; privatePilot?:boolean };
// Shapes returned by the checkout API. Every field is still validated at runtime below.
type PlansResponse = { enabled?:boolean; version?:string; termsVersion?:string; privatePilot?:boolean; plans?:unknown; privacyUrl?:string; salesTermsUrl?:string };
type ErrorResponse = { error?:string };
const orderStorage = 'rf-landing3-order-v1';
const money = (n:number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const messages:Record<string,string> = {
  pending:'Pix disponível. Pague pelo app do seu banco e consulte o pedido.',
  creating:'O pedido está sendo recebido. Consulte novamente em instantes.',
  uncertain:'A emissão não foi confirmada. Guarde esta aba e consulte o mesmo pedido.',
  paid:'Pagamento confirmado. Seu acesso será liberado.',
  expired:'O Pix expirou. Se você já pagou, consulte este pedido antes de iniciar outro.',
  failed:'A operadora informou que este pedido não foi concluído.',
  refunded:'A operadora registrou o estorno deste pagamento.',
  chargeback:'A operadora registrou uma contestação deste pagamento.',
};
class ApiError extends Error {
  constructor(readonly status:number, readonly code:string) { super(code); }
}
async function api<T>(root:string, path:string, signal:AbortSignal, body?:unknown): Promise<T> {
  const r = await fetch(root+path,{credentials:'same-origin',cache:'no-store',redirect:'error',signal,
    ...(body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {})});
  const parsed = await r.json() as T & ErrorResponse;
  if (!r.ok) throw new ApiError(r.status,String(parsed?.error ?? ''));
  return parsed;
}
function intentForPlan(planId:string, storage:string) {
  try {
    const saved=JSON.parse(sessionStorage.getItem(storage+':'+planId) ?? 'null');
    if (saved && typeof saved.planId === 'string' && UUID.test(saved.requestId)) return saved.planId === planId ? saved.requestId as string : '';
  } catch { /* Storage must be writable before creating a new intent. */ }
  return '';
}
export function LiveCheckoutDialog({plan,close,returnFocus,privatePilot=false}:Props) {
  const root=privatePilot ? PILOT_PATH+'/api' : '/api/checkout';
  const termsVersion=privatePilot ? PILOT_ACK_VERSION : TERMS_VERSION;
  const storage=privatePilot ? orderStorage+':pilot' : orderStorage;
  const dialog=useRef<HTMLDialogElement>(null);
  const controller=useRef<AbortController|null>(null);
  const busyRef=useRef(false);
  const [requestId,setRequestId]=useState(()=>intentForPlan(plan.id,storage));
  const [ready,setReady]=useState(false);
  const [links,setLinks]=useState<{privacyUrl:string;salesTermsUrl:string}|null>(null);
  const [busy,setBusy]=useState(false);
  const [receipt,setReceipt]=useState<Receipt|null>(null);
  const [error,setError]=useState('');
  const [copy,setCopy]=useState('');
  const [qr,setQr]=useState<{payload:string;image:string}|null>(null);
  const [now,setNow]=useState(Date.now);
  const payable=receipt?.status === 'pending' && receipt.pix && Date.parse(receipt.pix.expiresAt)>now ? receipt.pix : null;
  useEffect(()=>{
    const element=dialog.current;
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    element?.showModal();
    const check=new AbortController();
    api<PlansResponse>(root,'/plans',check.signal).then(data=>{
      if (!data.enabled || data.version!==CATALOG_VERSION || data.termsVersion!==termsVersion || Boolean(data.privatePilot)!==privatePilot ||
          !Array.isArray(data.plans) || !data.plans.some((p:Plan)=>p.id===plan.id && p.amountCents===plan.amountCents && p.months===plan.months) ||
          (!privatePilot && (!/^https:\/\//.test(data.privacyUrl ?? '') || !/^https:\/\//.test(data.salesTermsUrl ?? '')))) throw Error();
      if (!check.signal.aborted) {
        if (!privatePilot) setLinks({ privacyUrl:data.privacyUrl ?? '', salesTermsUrl:data.salesTermsUrl ?? '' });
        setReady(true);
      }
    }).catch(()=>{if (!check.signal.aborted) setError('Checkout indisponível. Volte mais tarde.');});
    return ()=>{check.abort();controller.current?.abort();element?.close();document.body.style.overflow=previous;returnFocus?.focus({preventScroll:true});};
  },[plan,returnFocus,privatePilot,root,termsVersion]);
  useEffect(()=>{
    if (!payable) return;
    let cancelled=false;
    toDataURL(payable.copyPaste,{width:220,margin:2}).then(value=>{if(!cancelled)setQr({payload:payable.copyPaste,image:value});}).catch(()=>{});
    const timer=setInterval(()=>setNow(Date.now()),1000);
    return ()=>{cancelled=true;clearInterval(timer);};
  },[payable]);
  async function run(action:(signal:AbortSignal)=>Promise<void>) {
    if (busyRef.current) return;
    busyRef.current=true;setBusy(true);setError('');setCopy('');
    const c=new AbortController();controller.current=c;
    const timer=setTimeout(()=>c.abort('timeout'),19_000);
    try { await action(c.signal); }
    catch (e) {
      if (!c.signal.aborted || c.signal.reason==='timeout') {
        const msg=e instanceof ApiError && e.code==='invalid_document' ? 'Confira o CPF ou CNPJ.' :
          e instanceof ApiError && e.status===429 ? 'Aguarde um minuto antes de consultar novamente.' :
          'Não foi possível confirmar esta etapa. Consulte o mesmo pedido se já tiver solicitado o Pix.';
        setError(msg);
      }
    } finally {clearTimeout(timer);busyRef.current=false; if(!c.signal.aborted || c.signal.reason==='timeout')setBusy(false);}
  }
  function validate(value:Receipt) {
    if (!value || value.plan.id!==plan.id || value.plan.amountCents!==plan.amountCents || value.currency!=='BRL' || !messages[value.status] || !/^[a-f0-9]{64}$/.test(value.id)) throw Error();
    setNow(Date.now());setReceipt(value);
  }
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || requestId || busyRef.current) return;
    const fields=new FormData(event.currentTarget);
    void run(async signal=>{
      await api(root,'/session',signal,{});
      const id=crypto.randomUUID();
      sessionStorage.setItem(storage+':'+plan.id,JSON.stringify({planId:plan.id,requestId:id}));
      setRequestId(id);
      try {
        validate(await api<Receipt>(root,'/orders',signal,{requestId:id,planId:plan.id,catalogVersion:CATALOG_VERSION,acceptedTermsVersion:termsVersion,
          buyer:{name:fields.get('name'),email:fields.get('email'),username:fields.get('username'),document:fields.get('document')}}));
      } catch(e) {
        // Definitive input rejection occurred before storage and the provider.
        if (e instanceof ApiError && [400,404].includes(e.status)) {sessionStorage.removeItem(storage+':'+plan.id);setRequestId('');}
        throw e;
      }
    });
  }
  function check() {
    if (!UUID.test(requestId)) return;
    void run(async signal=>{
      const path='/orders/'+requestId;
      const current=await api<Receipt>(root,path,signal);
      validate(current);
      if (['pending','uncertain','expired'].includes(current.status)) validate(await api<Receipt>(root,path+'/check',signal,{}));
    });
  }
  function closeDialog() {controller.current?.abort();close();}
  const status=receipt?.status === 'pending' && !payable ? 'expired' : receipt?.status;
  return <dialog className="checkout-dialog" aria-labelledby="live-title" ref={dialog} onCancel={event=>{event.preventDefault();closeDialog();}}>
    <div className="checkout-bar"><span>Checkout Pix</span><button type="button" className="checkout-close" aria-label="Fechar checkout" onClick={closeDialog}>×</button></div>
    <div className="checkout-layout">
      <aside className="checkout-summary"><h2 id="live-title">{plan.label}</h2><p className="checkout-price">{money(plan.amountCents)} por {plan.months===1?'1 mês':'12 meses'}</p><p>{privatePilot ? 'Teste privado de pagamento. O CPF ou CNPJ é enviado ao processador de pagamento para emitir o Pix.' : CHECKOUT_TERMS}</p></aside>
      <div className="checkout-main" aria-busy={busy}>
        {error && <p role="alert">{error}</p>}
        {requestId ? <div className="checkout-payment">
          <p role="status">{receipt?.fulfillment==='handled_manually'?'Pagamento confirmado. Seu acesso foi liberado.':status?messages[status]:'Consulte o pedido registrado nesta aba.'}</p>
          {receipt && <p className="checkout-helper">Referência para atendimento <code>{receipt.id}</code></p>}
          {payable && <><p>Expira às {new Date(payable.expiresAt).toLocaleString('pt-BR')}</p>{qr?.payload===payable.copyPaste && <img className="checkout-qr" src={qr.image} alt="QR Code Pix" />}
            <label className="checkout-copy-label">Pix copia e cola<input readOnly value={payable.copyPaste} onFocus={e=>e.target.select()}/></label>
            <button type="button" className="button" onClick={()=>void navigator.clipboard.writeText(payable.copyPaste).then(()=>setCopy('Código copiado.')).catch(()=>setCopy('Selecione e copie o código no campo acima.'))}>Copiar Pix</button>
            <p role="status">{copy}</p></>}
          <button type="button" className="button button-orange" disabled={busy} onClick={check}>{busy?'Consultando…':'Conferir pagamento'}</button>
        </div> : <form className="checkout-form" onSubmit={submit}>
          <label>Nome completo<input name="name" autoComplete="name" required minLength={2} maxLength={120}/></label>
          <label>E-mail de contato<input name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={privatePilot ? PILOT_EMAIL : undefined} readOnly={privatePilot}/></label>
          <label>Usuário desejado<input name="username" autoComplete="off" required maxLength={80}/><small>O usuário é conferido na liberação do acesso.</small></label>
          <label>CPF ou CNPJ<input name="document" inputMode="numeric" autoComplete="off" required maxLength={24}/></label>
          {links ? <><p><a target="_blank" rel="noreferrer" href={links.salesTermsUrl}>Condições de compra</a> · <a target="_blank" rel="noreferrer" href={links.privacyUrl}>Privacidade</a></p><label><span><input type="checkbox" required className="checkout-accept"/> Aceito as condições de compra e li a política de privacidade.</span></label></> : null}
          {privatePilot ? <label><span><input type="checkbox" required className="checkout-accept"/> {PILOT_ACK}</span></label> : null}
          <button className="button button-orange checkout-primary" disabled={!ready || busy}>{busy?'Preparando…':'Gerar Pix de '+money(plan.amountCents)}</button>
        </form>}
        <p className="checkout-helper">Suporte do checkout <a href={`mailto:${CHECKOUT_SUPPORT_EMAIL}`}>{CHECKOUT_SUPPORT_EMAIL}</a>{receipt && '. Informe a referência do pedido ao entrar em contato.'}</p>
      </div>
    </div>
  </dialog>;
}
