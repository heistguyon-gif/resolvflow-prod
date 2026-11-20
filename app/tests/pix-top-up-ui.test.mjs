import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {load,mount,flush,deferred} from './helpers/pix-ui-runtime.mjs';
const {usePixTopUp}=load('app/components/usePixTopUp.ts');
let hook;
function Harness({scope='account:workspace',onPaid=async()=>{}}){hook=usePixTopUp(scope,onPaid);return React.createElement('div',null,hook.error||hook.notice);}
const requests=ui=>ui.requests.filter(r=>r.method==='POST'&&!r.body?.action);
const saved=scope=>JSON.parse(sessionStorage.getItem('resolvflow:pix-intent:v1:'+scope));

test('double submit while pending produces one request with stable UUID; no document/QR is persisted',async()=>{
 const pending=deferred();const ui=await mount(Harness,{},()=>pending.promise);
 try{await act(async()=>{void hook.start(2000,'12345678901');void hook.start(2000,'12345678901');});assert.equal(requests(ui).length,1);const request=requests(ui)[0];assert.match(request.body.requestId,/^[a-f0-9-]{36}$/);assert.equal(saved('account:workspace').requestId,request.body.requestId);assert.ok(!JSON.stringify(sessionStorage).includes('12345678901'));
 pending.resolve(Response.json({id:'managed-payment',status:'creating',qrCode:null}));await flush();assert.equal(hook.charge.status,'creating');assert.match(hook.notice,/Cobrança em confirmação/);assert.ok(!hook.notice.includes('PIX gerado'));assert.equal(hook.locked,true);await act(async()=>hook.start(5000,'12345678901'));assert.equal(requests(ui).length,1);
 }finally{await ui.close();}
});
test('uncertain network failure never generates new UUID or repeats a legacy creation, including after remount',async()=>{
 let persisted;const ui=await mount(Harness,{},()=>{throw Error('PRIVATE_RAW_ERROR');});
 try{await act(async()=>hook.start(2000,'12345678901'));assert.equal(hook.locked,true);assert.ok(!hook.error.includes('PRIVATE_RAW_ERROR'));const id=requests(ui)[0].body.requestId;await act(async()=>hook.start(2000,'12345678901'));assert.equal(requests(ui).length,1);assert.equal(saved('account:workspace').requestId,id);persisted=sessionStorage.getItem('resolvflow:pix-intent:v1:account:workspace');}finally{await ui.close();}
 const again=await mount(Harness,{},()=>{throw Error('Unexpected transport');},{storage:{'resolvflow:pix-intent:v1:account:workspace':persisted}});
 try{assert.equal(hook.intent.requestId,JSON.parse(persisted).requestId);assert.equal(hook.locked,true);await act(async()=>hook.start(2000,'12345678901'));assert.equal(again.requests.length,0);}finally{await again.close();}
});
test('explicit input rejection permits correction with the SAME requestId, not a new retry identity',async()=>{
 let count=0;const ui=await mount(Harness,{},()=>++count===1?Response.json({code:'invalid_document'},{status:400}):Response.json({id:'legacy-or-managed',status:'pending',qrCode:'SYNTHETIC_NOT_PAYABLE'}));
 try{await act(async()=>hook.start(2000,'bad'));assert.equal(hook.locked,false);await act(async()=>hook.start(2000,'12345678901'));assert.equal(requests(ui).length,2);assert.equal(requests(ui)[0].body.requestId,requests(ui)[1].body.requestId);assert.equal(hook.charge.qrCode,'SYNTHETIC_NOT_PAYABLE');assert.equal(JSON.stringify(saved('account:workspace')).includes('SYNTHETIC'),false);}finally{await ui.close();}
});
test('status refresh addresses only the pinned payment; new intent requires terminal status plus explicit action',async()=>{
 let paid=0;const ui=await mount(Harness,{onPaid:async()=>{paid++;}},req=>Response.json(req.body.action==='status'?{id:'old-payment',status:'paid'}:{id:'old-payment',status:'pending',qrCode:'SYNTHETIC_NOT_PAYABLE'}));
 try{await act(async()=>hook.start(2000,'12345678901'));const id=requests(ui)[0].body.requestId;await act(async()=>hook.check());assert.deepEqual(ui.requests[1].body,{action:'status',paymentId:'old-payment'});assert.equal(paid,1);await act(async()=>hook.start(2000,'12345678901'));assert.equal(requests(ui).length,1);await act(async()=>hook.newIntent());await act(async()=>hook.start(2000,'12345678901'));assert.equal(requests(ui).length,2);assert.notEqual(requests(ui)[1].body.requestId,id);}finally{await ui.close();}
});
test('stale identity and unmount abort local requests, never apply a foreign paid response or refresh its wallet',async()=>{
 const pending=deferred();let paid=0;const ui=await mount(Harness,{scope:'old:workspace',onPaid:async()=>{paid++;}},()=>pending.promise);
 try{await act(async()=>{void hook.start(2000,'12345678901');});await ui.render({scope:'new:workspace',onPaid:async()=>{paid++;}});assert.ok(ui.requests[0].signal.aborted);pending.resolve(Response.json({id:'old-payment',status:'paid'}));await flush();assert.equal(hook.scope,'new:workspace');assert.equal(hook.charge,null);assert.equal(paid,0);assert.equal(hook.intent,null);}finally{await ui.close();}
});
test('status failure/foreign receipt preserves the original payment and never replays charge creation',async()=>{
 const ui=await mount(Harness,{},req=>Response.json(req.body.action?{id:'foreign',status:'paid'}:{id:'original',status:'pending',qrCode:'SYNTHETIC'}));
 try{await act(async()=>hook.start(2000,'12345678901'));await act(async()=>hook.check());assert.equal(hook.charge.id,'original');assert.equal(hook.charge.status,'pending');assert.match(hook.error,/pedido anterior foi preservado/);assert.equal(requests(ui).length,1);}finally{await ui.close();}
});
test('actual OtpMultiApi checkout sends UUID and treats creating as pending confirmation, without fake QR',async()=>{
 const purchases={useOtpPurchases:()=>({operations:[],recent:[],unconfirmed:false,error:'',notice:'',blocked:false})};
 const {OtpMultiApi}=load('app/components/OtpMultiApi.tsx',{'./useOtpPurchases':purchases});
 const wallet={accountId:'fixture-account',workspaceId:'fixture-workspace',configured:true,canManageApis:false,costMode:false,apis:[],minDepositCents:1500,minDepositLabel:'R$ 15,00',pixEnabled:true,pixRequiresDocument:false};
 const ui=await mount(OtpMultiApi,{canOperate:true},req=>{if(req.url==='/api/otp/pix')return Response.json({id:'receipt-fixture',status:'creating',qrCode:null});if(req.url.startsWith('/api/otp/wallet'))return Response.json(wallet);if(req.url.startsWith('/api/otp'))return Response.json({orders:[],inbox:{orders:[]}});throw Error('Unexpected fixture endpoint');});
 try{await ui.click('Gerar PIX');assert.equal(requests(ui).filter(r=>r.url==='/api/otp/pix').length,1);assert.match(requests(ui).find(r=>r.url==='/api/otp/pix').body.requestId,/^[a-f0-9-]{36}$/);assert.match(ui.dom.window.document.body.textContent,/Cobrança em confirmação/);assert.equal(ui.dom.window.document.querySelector('[aria-label="Código PIX copia e cola"]'),null);assert.equal(ui.find('Gerar PIX').disabled,true);}finally{await ui.close();}
});

test('actual checkout never displays the previous QR while generating an image for a new intention',async()=>{
 const purchases={useOtpPurchases:()=>({operations:[],recent:[],unconfirmed:false,error:'',notice:'',blocked:false})};
 const nextImage=deferred();let count=0;
 const {OtpMultiApi}=load('app/components/OtpMultiApi.tsx',{'./useOtpPurchases':purchases,'qrcode':{__esModule:true,default:{toDataURL:async code=>code==='SYNTHETIC_FIRST'?'data:image/png;base64,AAAA':nextImage.promise}}});
 const wallet={accountId:'fixture-account',workspaceId:'fixture-workspace',configured:true,canManageApis:false,costMode:false,apis:[],minDepositCents:1500,pixEnabled:true,pixRequiresDocument:false};
 const ui=await mount(OtpMultiApi,{canOperate:true},req=>{
  if(req.url==='/api/otp/pix')return Response.json(req.body.action==='status'?{id:'first',status:'paid'}:++count===1?{id:'first',status:'pending',qrCode:'SYNTHETIC_FIRST'}:{id:'second',status:'pending',qrCode:'SYNTHETIC_SECOND'});
  if(req.url.startsWith('/api/otp/wallet'))return Response.json(wallet);return Response.json({orders:[],inbox:{orders:[]}});
 });
 try{await ui.click('Gerar PIX');assert.match(ui.dom.window.document.querySelector('[aria-label="QR Code PIX"]').getAttribute('style'),/AAAA/);await ui.click('Conferir este pagamento');await ui.click('Iniciar outra recarga');await ui.click('Gerar PIX');assert.equal(ui.dom.window.document.querySelector('[aria-label="QR Code PIX"]'),null);nextImage.resolve('data:image/png;base64,BBBB');await flush();assert.match(ui.dom.window.document.querySelector('[aria-label="QR Code PIX"]').getAttribute('style'),/BBBB/);}finally{await ui.close();}
});
