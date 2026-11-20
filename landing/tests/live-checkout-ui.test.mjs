import test from 'node:test';
import assert from 'node:assert/strict';
import {load,mount,flush,act} from './runtime.mjs';
const {App}=load('src/App.tsx');
const {FIXED_PLANS,CATALOG_VERSION,TERMS_VERSION}=load('src/checkout/catalog.ts');
const catalog={enabled:true,version:CATALOG_VERSION,termsVersion:TERMS_VERSION,plans:FIXED_PLANS,privacyUrl:'https://fixture.test/privacy',salesTermsUrl:'https://fixture.test/terms'};
test('live offer opens the exact plan and uses the same saved intent after an interrupted create',async()=>{
 let posted;
 const ui=await mount(App,{}, {live:true,fetch:async(url,init)=>{
  if(url.endsWith('/plans'))return Response.json(catalog);
  if(url.endsWith('/session'))return Response.json({ready:true});
  if(url.endsWith('/orders')){posted=JSON.parse(init.body);throw Error('Dropped connection');}
  if(url.endsWith('/orders/'+posted.requestId))return Response.json({id:'a'.repeat(64),plan:FIXED_PLANS[0],currency:'BRL',status:'paid',pix:null,fulfillment:'pending_review'});
  throw Error('Unexpected request '+url);
 }});
 try {
  const trigger=ui.doc.querySelector('[data-plan-id="entrada-essencial"] button');
  await act(async()=>trigger.click());await flush();
  const form=ui.doc.querySelector('form.checkout-form');
  for (const [key,value] of Object.entries({name:'Pessoa Teste',email:'buyer@example.invalid',username:'fixture',document:'11144477735'}))form.elements.namedItem(key).value=value;
  form.querySelector('input[type="checkbox"]').checked=true;
  await act(async()=>form.dispatchEvent(new ui.dom.window.Event('submit',{bubbles:true,cancelable:true})));await flush();
  assert.equal(posted.planId,FIXED_PLANS[0].id);
  assert.equal('amountCents' in posted,false);
  assert.equal(ui.dom.window.sessionStorage.length,1);
  assert.ok(!JSON.stringify(ui.dom.window.sessionStorage).includes('buyer@example.invalid'));
  await act(async()=>ui.doc.querySelector('.checkout-close').click());await flush();
  await act(async()=>trigger.click());await flush();
  assert.equal(ui.doc.querySelector('form.checkout-form'),null);
  await ui.click('Conferir pagamento');
  assert.match(ui.doc.querySelector('dialog [role="status"]').textContent,/Seu acesso será liberado/);
  assert.equal(ui.doc.querySelector('dialog a[href^="mailto:"]').getAttribute('href'),'mailto:medchatbot5@gmail.com');
  assert.equal(ui.requests.filter(r=>r.args[0].endsWith('/orders')).length,1);
 } finally { await ui.close(); }
});
test('unavailable configuration disables submission and never opens a session',async()=>{
 const ui=await mount(App,{}, {live:true,fetch:async url=>{assert.equal(url,'/api/checkout/plans');return Response.json({...catalog,enabled:false});}});
 try{
  await ui.click('Comprar com Pix');
  assert.equal(ui.button('Gerar Pix').disabled,true);
  assert.match(ui.doc.querySelector('[role="alert"]').textContent,/indisponível/);
 }finally{await ui.close();}
});
