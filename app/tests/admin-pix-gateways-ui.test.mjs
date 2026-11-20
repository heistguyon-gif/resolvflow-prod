import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {load,css,mount,flush,deferred,fixtureState,lucas,managedId} from './helpers/pix-ui-runtime.mjs';
const {AdminPixGateways}=load('app/components/AdminPixGateways.tsx',{'./AdminPixGateways.module.css':css});
const {gatewayState,publicWebhookUrl}=load('app/components/pixGatewayPresentation.ts');
const post=ui=>ui.requests.filter(r=>r.method==='POST');

test('non-pilot identities never mount the admin or request metadata',async()=>{
 const ui=await mount(AdminPixGateways,{viewerEmail:'owner@example.test'},()=>{throw Error('Forbidden fixture');});
 try{assert.equal(ui.dom.window.document.body.textContent,'');await ui.render({viewerEmail:undefined});assert.equal(ui.requests.length,0);}finally{await ui.close();}
});
test('loading never fabricates an active provider; state and secrets are read from whitelisted public metadata',async()=>{
 const pending=deferred(),state=fixtureState();state.gateways[0].apiKey='SYNTHETIC_EXTRA_MUST_NOT_RENDER';
 const ui=await mount(AdminPixGateways,{viewerEmail:lucas},()=>pending.promise);
 try{assert.match(ui.dom.window.document.body.textContent,/Carregando seleção/);assert.equal(ui.find('Cadastrar configuração').disabled,true);
 pending.resolve(Response.json(state));await flush();assert.match(ui.dom.window.document.querySelector('.activePanel').textContent,/Lezty existente/);assert.ok(!ui.dom.window.document.body.innerHTML.includes('SYNTHETIC_EXTRA'));assert.match(ui.dom.window.document.body.textContent,/conexão não verificada/);assert.equal(post(ui).length,0);assert.equal('apiKey' in gatewayState(state).gateways[0],false);
 }finally{await ui.close();}
});
test('create can reuse a legacy key without reading it, requires webhook input and never activates',async()=>{
 let state=fixtureState();const ui=await mount(AdminPixGateways,{viewerEmail:lucas},req=>{if(req.method==='GET')return Response.json(state);assert.equal(req.body.action,'create');state={...state,revision:'2'};return Response.json({state});});
 try{await ui.click('Reaproveitar chave',ui.dom.window.document.querySelectorAll('.row')[1]);assert.equal(ui.dom.window.document.querySelector('input[name=apiKey]'),null);assert.equal(ui.dom.window.document.querySelector('input[name=webhookSecret]').required,true);
 await ui.value('[name=label]','Bravo adicional');await ui.value('[name=webhookSecret]','SYNTHETIC_ONLY');await ui.submit();const command=post(ui)[0].body;assert.equal(command.reuseLegacyKey,true);assert.equal(command.provider,'bravopay');assert.equal('apiKey' in command,false);assert.match(command.requestId,/^[a-f0-9-]{36}$/);assert.equal(command.expectedRevision,'1');assert.match(ui.dom.window.document.querySelector('.activePanel').textContent,/Lezty existente/);assert.equal(ui.dom.window.document.querySelector('dialog'),null);assert.ok(!ui.dom.window.document.body.innerHTML.includes('SYNTHETIC_ONLY'));assert.equal(post(ui).length,1);
 }finally{await ui.close();}
});
test('revision omits empty credentials and never confuses latest version with activeVersion',async()=>{
 const state=fixtureState();state.active={configId:managedId,version:1};state.gateways[0].active=false;state.gateways[0].activeVersion=null;state.gateways[2].active=true;state.gateways[2].activeVersion=1;
 const ui=await mount(AdminPixGateways,{viewerEmail:lucas},req=>Response.json(req.method==='GET'?state:{state:{...state,revision:'2'}}));
 try{assert.match(ui.dom.window.document.querySelector('.activePanel').textContent,/versão ativa 1/);assert.match(ui.dom.window.document.body.textContent,/Versão 2 salva, ainda não ativa/);assert.equal(ui.find('Usar versão 2').disabled,false);assert.equal(ui.find('Arquivar').disabled,true);await ui.click('Revisar');await ui.value('[name=label]','Bravo revisado');await ui.submit();assert.equal(post(ui)[0].body.action,'revise');assert.equal('apiKey' in post(ui)[0].body,false);assert.equal('webhookSecret' in post(ui)[0].body,false);assert.match(ui.dom.window.document.querySelector('.activePanel').textContent,/versão ativa 1/);
 }finally{await ui.close();}
});
test('activation is explicit, no optimistic switch, double click sends once; uncertainty rechecks identical command',async()=>{
 const waiting=deferred();let attempts=0;const initial=fixtureState();const ui=await mount(AdminPixGateways,{viewerEmail:lucas},req=>{if(req.method==='GET')return Response.json(initial);if(++attempts===1)return waiting.promise;const state=fixtureState();state.active={configId:managedId,version:2};return Response.json({state});});
 try{await ui.click('Usar versão 2');assert.equal(post(ui).length,0);assert.match(ui.dom.window.document.querySelector('dialog').textContent,/anteriores/);const button=ui.find('Usar para novas cobranças');await act(async()=>{button.click();button.click();});assert.equal(post(ui).length,1);assert.match(ui.dom.window.document.querySelector('.activePanel').textContent,/Lezty existente/);waiting.resolve(Response.json({code:'storage_unavailable',error:'PRIVATE_UPSTREAM'}, {status:503}));await flush();assert.equal(ui.find('Cadastrar configuração').disabled,true);assert.ok(!ui.dom.window.document.body.innerHTML.includes('PRIVATE_UPSTREAM'));await ui.click('Conferir mesma alteração');assert.deepEqual(post(ui)[0].body,post(ui)[1].body);assert.match(ui.dom.window.document.querySelector('.activePanel').textContent,/Bravo principal.*versão ativa 2/);
 }finally{await ui.close();}
});
test('revision conflict disables mutation until explicit refresh and does not silently retry',async()=>{
 const ui=await mount(AdminPixGateways,{viewerEmail:lucas},req=>req.method==='GET'?Response.json(fixtureState()):Response.json({code:'revision_conflict'},{status:409}));
 try{await ui.click('Usar versão 2');await ui.click('Usar para novas cobranças');assert.equal(post(ui).length,1);assert.equal(ui.find('Cadastrar configuração').disabled,true);await ui.click('Atualizar lista');assert.equal(ui.find('Cadastrar configuração').disabled,false);assert.equal(post(ui).length,1);}finally{await ui.close();}
});
test('partial reload failure preserves last complete state and disables changes',async()=>{
 let reads=0;const ui=await mount(AdminPixGateways,{viewerEmail:lucas},()=>++reads===1?Response.json(fixtureState()):Response.json({error:'PRIVATE'}, {status:503}));
 try{await ui.click('Atualizar lista');assert.equal(ui.dom.window.document.querySelectorAll('.row').length,3);assert.equal(ui.find('Cadastrar configuração').disabled,true);assert.ok(!ui.dom.window.document.body.innerHTML.includes('PRIVATE'));}finally{await ui.close();}
});
test('server denial clears metadata and late old-login responses cannot render after identity change',async()=>{
 const pending=deferred();const ui=await mount(AdminPixGateways,{viewerEmail:lucas},()=>pending.promise);
 try{await ui.render({viewerEmail:'other-admin@example.test'});pending.resolve(Response.json(fixtureState()));await flush();assert.equal(ui.dom.window.document.querySelector('section'),null);assert.ok(ui.requests[0].signal.aborted);}finally{await ui.close();}
 const denied=await mount(AdminPixGateways,{viewerEmail:lucas},()=>Response.json({error:'Forbidden'},{status:403}));try{assert.match(denied.dom.window.document.body.textContent,/exclusiva do administrador principal/);assert.equal(denied.dom.window.document.querySelector('.row'),null);}finally{await denied.close();}
});
test('archived rows stay visible but cannot mutate; dialog cancel and server-only webhook are safe',async()=>{
 const state=fixtureState();state.gateways[2].status='archived';state.gateways[2].webhookUrl='https://evil.test/?secret=PRIVATE';const ui=await mount(AdminPixGateways,{viewerEmail:lucas},()=>Response.json(state));
 try{assert.equal(ui.find('Usar versão 2').disabled,true);assert.equal(ui.find('Revisar').disabled,true);assert.ok(!ui.dom.window.document.body.innerHTML.includes('PRIVATE'));await ui.click('Cadastrar configuração');await act(async()=>ui.dom.window.document.querySelector('dialog').dispatchEvent(new ui.dom.window.Event('cancel',{cancelable:true})));assert.equal(ui.dom.window.document.querySelector('dialog'),null);assert.equal(post(ui).length,0);}finally{await ui.close();}
 for(const value of ['http://resolvflow.online/api/otp/pix/webhook','https://resolvflow.online.evil.test/api/otp/pix/webhook','https://u:p@resolvflow.online/api/otp/pix/webhook','https://resolvflow.online/api/otp/pix/webhook?token=abc'])assert.equal(publicWebhookUrl(value),null);
});
test('real dashboard menu and direct view are restricted by authenticated email, not owner role',async()=>{
 const mock={};for(const name of ['SharkBotSaleNotifier','AdminUsersDirectory','MetaAppsManager','AdminOtpCenter','OwnerAdminOtpCenter','AdminWorkspaceView','AdminAnalysisDashboard','AdminWalletHistory','AdminStoriesManager','AdminFeatureAccess','MailReaderNavLink'])mock['./'+(name==='SharkBotSaleNotifier'?'SharkBotIntegration':name)]={[name]:()=>null};
 mock['./PlatformAdminDashboard.module.css']=css;mock['./AdminPixGateways.module.css']=css;mock['../lib/adminDateTime']={formatAdminDateTime:()=>'',formatAdminUtcClock:()=>''};mock['next/link']={__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
 const {PlatformAdminDashboard}=load('app/components/PlatformAdminDashboard.tsx',mock);
 const ui=await mount(PlatformAdminDashboard,{viewerRole:'owner',viewerEmail:'another@example.test'},()=>Response.json({}),{url:'https://fixture.test/admin?view=pix-gateways'});
 try{assert.equal(ui.find('↗Gateways Pix'),undefined);assert.equal(ui.requests.some(r=>r.url.includes('pix-gateways')),false);assert.equal(ui.dom.window.document.querySelector('#pix-gateways-title'),null);}finally{await ui.close();}
});
