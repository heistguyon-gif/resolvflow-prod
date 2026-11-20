import test from 'node:test';
import assert from 'node:assert/strict';
import React, { useState } from 'react';
import { fileURLToPath } from 'node:url';
import { load, mount, act, flush } from './runtime.mjs';
const moduleCache = new Map();
const { App } = load(fileURLToPath(new URL('../src/App.tsx',import.meta.url)),moduleCache);
const { CheckoutDialog } = load(fileURLToPath(new URL('../src/checkout/CheckoutDialog.tsx',import.meta.url)),moduleCache);
const { createCheckoutMock, previewCatalog } = load(fileURLToPath(new URL('../src/checkout/checkoutMock.ts',import.meta.url)),moduleCache);
const { PLAN_PROPOSALS } = load(fileURLToPath(new URL('../src/shared/planProposals.ts',import.meta.url)),moduleCache);
const firstPlan = PLAN_PROPOSALS[0].plans[0];
const fixtureReceipt = (intent, overrides={}) => ({mode:'simulation',purpose:'saas_plan',provider:'leztypay',simulationId:intent.requestId,requestId:intent.requestId,planId:intent.planId,reference:intent.requestId,status:'simulated_pending',isPayable:false,copyPaste:null,qrData:null,expiresAt:null,fulfillment:'not_started',demoDeadline:Date.now()+60_000,...overrides});
const deferred = () => {let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function transportFor({create,status}={}) {
 const calls=[];
 return {mode:'simulation',calls,create:(intent,signal)=>{calls.push({method:'create',intent,signal});return create?create(intent,signal):Promise.resolve(fixtureReceipt(intent));},status:(intent,signal)=>{calls.push({method:'status',intent,signal});return status?status(intent,signal):Promise.resolve(fixtureReceipt(intent));}};
}
function DialogFixture({transport,plan=firstPlan}) {
 const [open,setOpen]=useState(true);
 return React.createElement(React.Fragment,null,React.createElement('button',{id:'return-target',onClick:()=>setOpen(true)},'Abrir novamente'),open&&React.createElement(CheckoutDialog,{key:plan.id,plan,proposalTitle:'Entrada e operação',transport,returnFocus:document.getElementById('return-target'),onClose:()=>setOpen(false)}));
}
async function submit(ui) {await ui.click('Continuar com simulação');}
async function key(ui,value,shift=false){const event=new ui.dom.window.KeyboardEvent('keydown',{key:value,shiftKey:shift,bubbles:true,cancelable:true});await act(async()=>ui.doc.activeElement.dispatchEvent(event));await flush();return event;}

test('landing 3 abre modal real para os cinco planos fixos e preserva todos os preços/faixas',async()=>{
 const ui=await mount(App);try{
  for(const proposal of PLAN_PROPOSALS){await act(async()=>ui.doc.getElementById('proposal-tab-'+proposal.id).click());await flush();
   for(const plan of proposal.plans){const trigger=ui.doc.querySelector(`[data-plan-id="${plan.id}"] button`);if (plan.price.kind === "range" || plan.price.kind === "undetermined") { assert.equal(trigger, null); continue; } await act(async()=>trigger.click());await flush();
    assert.equal(ui.doc.querySelector('dialog').dataset.modal,'true');assert.equal(ui.doc.querySelector('.checkout-price').textContent,plan.price.fullLabel);assert.equal(ui.doc.querySelector('.checkout-summary h2').textContent,plan.title);
    assert.equal(ui.doc.activeElement.id,'checkout-name');assert.match(ui.doc.querySelector('.checkout-summary').textContent,/Pix/);assert.doesNotMatch(ui.doc.querySelector('.checkout-summary').textContent,/LEZTY|Lezty/i);assert.equal(ui.doc.querySelector('#checkout-email').value,'pessoa@exemplo.invalid');
    assert.equal(ui.doc.querySelector('#checkout-name').readOnly,true);assert.equal(ui.doc.querySelector('#checkout-user').readOnly,true);assert.equal(ui.doc.querySelector('#checkout-email').readOnly,true);assert.equal(ui.doc.querySelector('#checkout-document').disabled,true);assert.equal(ui.doc.querySelector('#checkout-document').value,'');
    if(proposal.id==='anual')assert.ok(ui.doc.querySelector('.checkout-summary').textContent.indexOf(plan.price.fullLabel)<ui.doc.querySelector('.checkout-summary').textContent.indexOf('Equivale'));
    await act(async()=>ui.doc.querySelector('.checkout-close').click());await flush();assert.equal(ui.doc.querySelector('dialog'),null);assert.equal(ui.doc.activeElement,trigger);assert.equal(ui.doc.body.style.overflow,'');
   }
  }
 }finally{await ui.close();}
});

test('Escape fecha, foco retorna ao card, Tab e Shift+Tab permanecem no modal',async()=>{
 const ui=await mount(App);try{const trigger=ui.doc.querySelector('.plan-link');await act(async()=>trigger.click());await flush();const first=ui.doc.querySelector('.checkout-close'),last=ui.button('Continuar com simulação');
  last.focus();assert.equal((await key(ui,'Tab')).defaultPrevented,true);assert.equal(ui.doc.activeElement,first);
  first.focus();assert.equal((await key(ui,'Tab',true)).defaultPrevented,true);assert.equal(ui.doc.activeElement,last);
  const cancel=new ui.dom.window.Event('cancel',{bubbles:false,cancelable:true});await act(async()=>ui.doc.querySelector('dialog').dispatchEvent(cancel));await flush();assert.equal(cancel.defaultPrevented,true);assert.equal(ui.doc.querySelector('dialog'),null);assert.equal(ui.doc.activeElement,trigger);
 }finally{await ui.close();}
});

test('loading e duplo clique criam um único intento; fixture de comprador nunca cruza transporte',async()=>{
 const waiting=deferred(),transport=transportFor({create:()=>waiting.promise});const ui=await mount(DialogFixture,{transport});try{
  const button=ui.button('Continuar com simulação');await act(async()=>{button.click();button.click();});await flush();
  assert.equal(transport.calls.length,1);assert.match(ui.doc.querySelector('#checkout-title').textContent,/Preparando/);assert.equal(ui.doc.querySelector('.checkout-main').getAttribute('aria-busy'),'true');
  assert.deepEqual(Object.keys(transport.calls[0].intent).sort(),['planId','requestId']);assert.match(transport.calls[0].intent.requestId,/^demo-/);assert.doesNotMatch(JSON.stringify(transport.calls[0].intent),/@|Pessoa|operador/);
  await act(async()=>waiting.resolve(fixtureReceipt(transport.calls[0].intent)));await flush();assert.match(ui.doc.querySelector('#checkout-title').textContent,/Pix de demonstração/);assert.equal(ui.button('Copiar Pix indisponível').disabled,true);
 }finally{await ui.close();}
});

test('copiar é só referência; não consulta, não confirma e não entrega acesso',async()=>{
 const transport=transportFor(),copied=[];const ui=await mount(DialogFixture,{transport});try{
  Object.defineProperty(ui.dom.window.navigator,'clipboard',{configurable:true,value:{writeText:async value=>copied.push(value)}});await submit(ui);await ui.click('Copiar referência da demo');
  assert.equal(copied.length,1);assert.match(copied[0],/^demo-/);assert.doesNotMatch(copied[0],/^000201/);assert.equal(transport.calls.length,1);assert.match(ui.doc.querySelector('.checkout-announcements').textContent,/Não é um código Pix/);assert.match(ui.doc.querySelector('.checkout-status').textContent,/Aguardando/);
 }finally{await ui.close();}
});

test('falha de clipboard mantém referência selecionável e não indica cópia bem sucedida',async()=>{
 const ui=await mount(DialogFixture,{transport:transportFor()});try{Object.defineProperty(ui.dom.window.navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('blocked');}}});await submit(ui);await ui.click('Copiar referência da demo');assert.match(ui.doc.querySelector('.checkout-announcements').textContent,/Cópia indisponível/);const input=ui.doc.getElementById('checkout-copy');input.focus();assert.equal(input.selectionStart,0);assert.equal(input.selectionEnd,input.value.length);}finally{await ui.close();}
});

test('consulta explícita usa mesmo ID, bloqueia concorrência e confirma somente simulação',async()=>{
 const waiting=deferred(),transport=transportFor({status:()=>waiting.promise});const ui=await mount(DialogFixture,{transport});try{await submit(ui);const button=ui.button('Consultar status simulado');await act(async()=>{button.click();button.click();});await flush();assert.equal(transport.calls.length,2);assert.deepEqual(transport.calls[0].intent,transport.calls[1].intent);assert.match(ui.doc.querySelector('#checkout-title').textContent,/Consultando/);
  await act(async()=>waiting.resolve(fixtureReceipt(transport.calls[0].intent,{status:'simulated_paid'})));await flush();assert.match(ui.doc.querySelector('#checkout-title').textContent,/Pagamento simulado confirmado/);assert.match(ui.doc.querySelector('.checkout-success').textContent,/Nenhum valor foi pago e nenhum acesso foi liberado/);assert.equal(ui.doc.querySelector('.checkout-qr'),null);
 }finally{await ui.close();}
});

test('incerteza ao preparar oferece consulta do mesmo intento, sem repetir criação',async()=>{
 const calls=[];const mock=createCheckoutMock('uncertain',0);const transport={mode:'simulation',create:async(intent,signal)=>{calls.push(['create',intent]);return mock.create(intent,signal);},status:async(intent,signal)=>{calls.push(['status',intent]);return mock.status(intent,signal);}};const ui=await mount(DialogFixture,{transport});try{await submit(ui);assert.match(ui.doc.querySelector('#checkout-title').textContent,/ainda não confirmado/);assert.equal(ui.button('Tentar o mesmo'),undefined);await ui.click('Consultar o mesmo exemplo');assert.equal(calls.length,2);assert.deepEqual(calls[0][1],calls[1][1]);assert.deepEqual(calls.map(call=>call[0]),['create','status']);assert.match(ui.doc.querySelector('.checkout-status').textContent,/Aguardando/);}finally{await ui.close();}
});

test('falha de criação conhecida mantém ID se usuário repetir explicitamente',async()=>{
 const mock=createCheckoutMock('error',0),calls=[];const transport={...mock,create:async(intent,signal)=>{calls.push(intent);return mock.create(intent,signal);}};const ui=await mount(DialogFixture,{transport});try{await submit(ui);assert.match(ui.doc.querySelector('#checkout-title').textContent,/Não foi possível preparar/);assert.equal(calls.length,1);await ui.click('Tentar o mesmo exemplo');assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);}finally{await ui.close();}
});

test('erro de status preserva identidade e nunca cai em nova criação',async()=>{
 const transport=transportFor({status:async()=>{throw Error('fixture unavailable');}}),ui=await mount(DialogFixture,{transport});try{await submit(ui);await ui.click('Consultar status simulado');assert.match(ui.doc.querySelector('#checkout-title').textContent,/não confirmado/);assert.equal(ui.button('Tentar o mesmo'),undefined);await ui.click('Consultar o mesmo exemplo');assert.deepEqual(transport.calls.map(call=>call.method),['create','status','status']);assert.ok(transport.calls.every(call=>call.intent.requestId===transport.calls[0].intent.requestId));}finally{await ui.close();}
});

test('prazo simulado expirado desativa QR/cópia sem renovar ou presumir pagamento',async()=>{
 const transport=transportFor({create:async intent=>fixtureReceipt(intent,{demoDeadline:Date.now()-10})}),ui=await mount(DialogFixture,{transport});try{await submit(ui);assert.match(ui.doc.querySelector('#checkout-title').textContent,/expirou/);assert.equal(ui.doc.querySelector('.checkout-qr'),null);assert.equal(ui.button('Copiar referência'),undefined);assert.equal(transport.calls.length,1);}finally{await ui.close();}
});

test('contagem chega à expiração sem request ou aprovação automática',async()=>{
 const transport=transportFor({create:async intent=>fixtureReceipt(intent,{demoDeadline:Date.now()+50})}),ui=await mount(DialogFixture,{transport});try{await submit(ui);await act(async()=>new Promise(resolve=>setTimeout(resolve,1100)));await flush();assert.match(ui.doc.querySelector('#checkout-title').textContent,/expirou/);assert.equal(transport.calls.length,1);}finally{await ui.close();}
});

test('fechar durante criação aborta e resposta tardia não muda outro plano',async()=>{
 const waiting=deferred(),transport=transportFor({create:()=>waiting.promise}),ui=await mount(DialogFixture,{transport});try{await submit(ui);await act(async()=>ui.doc.querySelector('.checkout-close').click());await flush();assert.equal(transport.calls[0].signal.aborted,true);await ui.rerender({transport,plan:PLAN_PROPOSALS[2].plans[1]});await ui.click('Abrir novamente');assert.match(ui.doc.querySelector('.checkout-summary h2').textContent,/Operação anual/);await act(async()=>waiting.resolve(fixtureReceipt(transport.calls[0].intent,{status:'simulated_paid'})));await flush();assert.match(ui.doc.querySelector('#checkout-title').textContent,/Simule sua compra/);assert.equal(ui.doc.querySelector('.checkout-success'),null);}finally{await ui.close();}
});

test('unmount durante consulta aborta e resposta tardia é descartada',async()=>{
 const waiting=deferred(),transport=transportFor({status:()=>waiting.promise}),ui=await mount(DialogFixture,{transport});await submit(ui);await ui.click('Consultar status simulado');const intent=transport.calls[1].intent;await ui.close();assert.equal(transport.calls[1].signal.aborted,true);await waiting.resolve(fixtureReceipt(intent,{status:'simulated_paid'}));await new Promise(resolve=>setTimeout(resolve,0));
});

for(const invalid of ['foreign-plan','foreign-intent','live-mode','payable'])test('resposta incompatível '+invalid+' não confirma compra nem exibe QR',async()=>{
 const overrides={'foreign-plan':{planId:'outro'},'foreign-intent':{requestId:'demo-other'},'live-mode':{mode:'live'},payable:{isPayable:true}}[invalid];const transport=transportFor({create:async intent=>fixtureReceipt(intent,overrides)}),ui=await mount(DialogFixture,{transport});try{await submit(ui);assert.match(ui.doc.querySelector('#checkout-title').textContent,/não confirmado/);assert.equal(ui.doc.querySelector('.checkout-qr'),null);assert.equal(ui.doc.querySelector('.checkout-success'),null);}finally{await ui.close();}
});

test('catálogo inteiro é hipótese não pagável, sem converter faixas nem anual em mensal',()=>{
 assert.equal(previewCatalog.plans.length,9);assert.equal(previewCatalog.checkoutEnabled,false);assert.ok(previewCatalog.plans.every(plan=>plan.amountCents===null&&!plan.canCharge&&plan.commercialStatus==='hypothesis'));assert.equal(previewCatalog.plans.find(plan=>plan.id==='anual-operacao').displayPrice,'R$ 2.970 por 12 meses · hipótese');assert.equal(previewCatalog.plans.find(plan=>plan.id==='volume-expansao60').displayPrice,'R$ 697–997/mês · faixa proposta');
});

test('transporte local é idempotente por plano/intento e não reatribui mesma chave',async()=>{
 const mock=createCheckoutMock('pending',0),signal=new AbortController().signal,intent={requestId:'demo-unique',planId:firstPlan.id};const first=await mock.create(intent,signal),second=await mock.create(intent,signal);assert.deepEqual(first,second);await assert.rejects(mock.create({...intent,planId:'anual-operacao'},signal));await assert.rejects(mock.create({...intent,requestId:'not-demo'},signal));await assert.rejects(mock.create({...intent,planId:'not-a-plan'},signal));assert.equal(first.copyPaste,null);assert.equal(first.expiresAt,null);assert.equal(first.fulfillment,'not_started');
});

test('demo preservada: 2×2=4, indisponível bloqueado, voltar/skip/reset e tabs teclado',async()=>{
 const events=[],ui=await mount(App,{onEvent:event=>events.push(event)});try{
  assert.equal(ui.doc.querySelector('input[value="c"]').disabled,true);await ui.toggle('profiles','a');await ui.toggle('profiles','b');await ui.click('Escolher mídias');await ui.toggle('media','process');await ui.click('Revisar campanha');assert.equal(ui.doc.querySelectorAll('[data-queue-item]').length,4);await ui.click('Simular programação');assert.match(ui.doc.querySelector('[data-result-summary]').textContent,/2 mídias e 2 perfis: 4 itens/);await ui.follow('.campaign-toolbar a');assert.equal(ui.doc.activeElement.id,'planos');ui.doc.getElementById('proposal-tab-entrada').focus();await key(ui,'End');assert.equal(ui.doc.activeElement.id,'proposal-tab-anual');assert.equal(ui.doc.querySelectorAll('[data-queue-item]').length,4);await ui.click('Reiniciar exemplo');assert.equal(ui.button('Escolher mídias').disabled,true);assert.ok(events.every(event=>event.synthetic));assert.equal(JSON.stringify(events).includes('@'),false);
 }finally{await ui.close();}
});
