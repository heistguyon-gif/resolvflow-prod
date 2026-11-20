import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { loadStoryModule } from './helpers/story-modules.mjs';

const qaRequire = createRequire(new URL('../../hotmail-export-20261112-candidate/.integration/ui-runtime/package.json', import.meta.url));
const { JSDOM } = qaRequire('jsdom');
const css = new Proxy({}, { get: (_, key) => String(key) });
const mocks = {
  './StoryHighlightManager.module.css': { __esModule: true, default: css },
  './StoryTemplates.module.css': { __esModule: true, default: css },
  './ProfileSetup': { ProfileSetup: () => null }, './StoryInviteCapture': { StoryInviteCapture: () => null },
};
const { StoryHighlightManager } = loadStoryModule(fileURLToPath(new URL('../app/components/StoryHighlightManager.tsx', import.meta.url)), mocks);
const { StoryTemplates } = loadStoryModule(fileURLToPath(new URL('../app/components/StoryTemplates.tsx', import.meta.url)), mocks);
const endpoint = '/api/story-bridge/highlights';
const start = Date.parse('2026-11-18T12:00:00.000Z');
const profile = (extra = {}) => ({ id: 'browser-a', sessionId: 'session-a', instagramUserId: '101', label: '@perfil.exemplo.a', available: true, capabilities: { highlightManagement: 1 }, ...extra });
const targetOf = b => ({ browserId: b.id, sessionId: b.sessionId, instagramUserId: b.instagramUserId });
const highlight = { id: 'highlight:123', title: 'Bastidores' };
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) });
const defer = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const settle = () => act(async () => { for (let i=0;i<4;i++) await new Promise(resolve => setTimeout(resolve,0)); });

test('server page prop requires exact normalized principal AND master owner, never an owner role alone',async()=>{
  for(const [email,owner,expected] of [
    ['lucasbgn.affiliate@gmail.com','master-fixture',true],
    [' LUCASBGN.AFFILIATE@GMAIL.COM ','master-fixture',true],
    ['other@example.test','master-fixture',false],
    ['lucasbgn.affiliate@gmail.com','shared-workspace',false],
  ]){
    const {default:Page}=loadStoryModule(fileURLToPath(new URL('../app/stories/page.tsx',import.meta.url)),{
      'next/headers':{headers:async()=>new Headers()},'next/navigation':{redirect:()=>{throw Error('Unexpected redirect');}},
      '../chatgpt-auth':{requireChatGPTUser:async()=>({userId:'authenticated-user',email})},
      '../../lib/auth':{requireWorkspaceContext:async()=>({email,workspaceOwnerUserId:owner,accountUserId:'actor',role:'owner',displayName:'Fixture'}),isPlatformOwnerEmail:()=>true},
      '../../lib/feature-rollouts':{isFeatureEnabled:()=>true},'../../lib/story-permissions':{canUseStories:async()=>true},
      '../../lib/story-bridge':{MASTER_STORY_OWNER:'master-fixture'},
      '../components/StoryTemplates':{StoryTemplates:()=>null},'../components/StoriesShell':{StoriesShell:()=>null},
    });
    const rendered=await Page();assert.equal(rendered.props.children.props.highlightManagementEnabled,expected,email+' / '+owner);
    assert.equal(rendered.props.children.key,'authenticated-user:'+owner);
  }
});

async function mount({ browsers = [profile()], operations = [], fetcher, parent = false, enabled = true, scope = 'principal-a:workspace-master', onAccessRevoked } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.test/', pretendToBeVisual: true });
  const previous = new Map(), calls = [], intervals = new Set(), warnings = [];
  const global = (key,value) => { previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key)); Object.defineProperty(globalThis,key,{configurable:true,writable:true,value}); };
  for (const key of ['window','document','HTMLElement','HTMLInputElement','navigator','File','Blob','FormData','URL']) global(key,key==='window'?dom.window:dom.window[key]);
  global('IS_REACT_ACT_ENVIRONMENT',true);
  let elapsed = 0, state = { browsers, operations, serverTime:start };
  global('performance',{ now:()=>elapsed });
  Object.defineProperty(dom.window.document,'fonts',{value:{ready:Promise.resolve()}});
  dom.window.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:text=>({width:text.length*15})});
  dom.window.setInterval=fn=>{intervals.add(fn);return fn;}; dom.window.clearInterval=fn=>intervals.delete(fn);
  global('fetch',async (url,init={})=>{
    assert.ok([endpoint,'/api/story-bridge'].includes(url),'Only isolated bridge mocks; no provider/real transport');
    const call={url,method:init.method||'GET',...init}; calls.push(call);
    if(fetcher){const result=await fetcher(call,state);if(result!==undefined)return result;}
    if(url==='/api/story-bridge') return json({templates:[],browsers:[],dispatches:[],serverTime:start+elapsed,extensionConfigured:true});
    if(call.method==='GET')return json({...state,serverTime:start+elapsed});
    const body=JSON.parse(call.body),browser=state.browsers.find(b=>b.id===body.target.browserId);
    const operation={id:'operation-'+calls.filter(c=>c.method==='POST').length,requestId:body.requestId,action:body.action,target:body.target,label:browser?.label||'Perfil',status:'queued',message:'queued',createdAt:new Date(start+elapsed).toISOString(),...(body.action==='delete'?{highlightId:body.highlightId,highlightTitle:body.confirmedTitle}:{})};
    state={...state,operations:[operation,...state.operations]}; return json({operation},202);
  });
  dom.window.fetch=globalThis.fetch;
  dom.window.XMLHttpRequest=class{constructor(){throw Error('No external transport');}};
  dom.window.navigator.sendBeacon=()=>{throw Error('No telemetry');};
  const error = console.error; console.error=(...args)=>warnings.push(args);
  const {createRoot}=await import('react-dom/client');
  const root=createRoot(dom.window.document.getElementById('root'));
  const render = nextScope => root.render(parent?React.createElement(StoryTemplates,{key:nextScope,scopeKey:nextScope,role:'owner',storiesOnly:true,highlightManagementEnabled:enabled}):React.createElement(StoryHighlightManager,{scopeKey:nextScope,onAccessRevoked}));
  await act(async()=>render(scope));await settle();
  const doc=dom.window.document;
  const buttons=()=>Array.from(doc.querySelectorAll('button'));
  const button=name=>{const found=buttons().find(b=>b.textContent===name);assert.ok(found,'button '+name);return found;};
  const clickNode=async node=>{await act(async()=>node.click());await settle();};
  const api={doc,calls,dom,button,
    posts(){return calls.filter(c=>c.method==='POST').map(c=>JSON.parse(c.body));},
    async click(name){await clickNode(button(name));},
    async clickNode(node){await clickNode(node);},
    async select(id='browser-a'){await act(async()=>{const input=doc.querySelector('select');assert.ok(input);Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set.call(input,id);input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});await settle();},
    async refresh(){await api.click('Atualizar recibos');},
    state(){return state;},set(next){state=typeof next==='function'?next(state):next;},
    async tick(ms=5000){elapsed+=ms;await act(async()=>{for(const fn of intervals)fn();});await settle();},
    advance(ms){elapsed+=ms;},
    async changeScope(next){await act(async()=>render(next));await settle();},
    async list(items=[highlight],extra={}){await api.select();await api.click('Consultar destaques');assert.equal(api.posts().at(-1)?.action,'list');await api.completeList(items,extra);},
    async completeList(items=[highlight],extra={}){state={...state,operations:state.operations.map(op=>op.action==='list'?{...op,status:'completed',message:'listed',completedAt:new Date(start+elapsed).toISOString(),highlights:items,...extra}:op)};await api.refresh();},
    async confirm(){await api.click('Excluir');await clickNode(doc.querySelector('.confirmation input'));await api.click('Confirmar exclusão');},
    async unmount(){await act(async()=>root.unmount());},
    async close(){await act(async()=>root.unmount());dom.window.close();console.error=error;for(const[key,descriptor]of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];assert.deepEqual(warnings,[],'No React runtime warnings');},
  };
  return api;
}

test('server-denied pilot is absent even for an owner in the master workspace',async()=>{
  const app=await mount({parent:true,enabled:false,fetcher:call=>call.url===endpoint?json({error:'forbidden'},403):undefined});try{
    assert.equal(app.doc.querySelector('#story-tab-highlights'),null);assert.equal(app.posts().length,0);
    assert.ok(app.doc.querySelector('#story-tab-publish'));assert.equal(app.calls.filter(c=>c.url===endpoint).length,0);
  }finally{await app.close();}
});
test('authorized integration adds a keyboard tab and preserves normal Stories tabs',async()=>{
  const app=await mount({parent:true});try{
    const tab=app.doc.querySelector('#story-tab-highlights');assert.ok(tab);assert.equal(tab.getAttribute('aria-selected'),'false');
    const templates=app.doc.querySelector('#story-tab-templates');await app.clickNode(templates);
    await act(async()=>templates.dispatchEvent(new app.dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));await settle();
    assert.equal(app.doc.activeElement.id,'story-tab-highlights');assert.equal(tab.getAttribute('aria-selected'),'true');
    assert.ok(app.doc.querySelector('#story-section-highlights select'));assert.equal(app.posts().length,0);
  }finally{await app.close();}
});
test('no auto selection/POST; unavailable and old extension options are disabled',async()=>{
  const app=await mount({browsers:[profile(),profile({id:'old',instagramUserId:'102',capabilities:{storyOptions:1,stickerRotation:1}}),profile({id:'offline',instagramUserId:'103',available:false})]});try{
    assert.equal(app.button('Consultar destaques').disabled,true);assert.equal(app.posts().length,0);
    assert.equal(app.doc.querySelector('option[value="old"]').disabled,true);assert.equal(app.doc.querySelector('option[value="offline"]').disabled,true);
    await app.select();assert.equal(app.button('Consultar destaques').disabled,false);
  }finally{await app.close();}
});
test('offline browser with no Instagram ID leaves connected profiles usable',async()=>{
  const app=await mount({browsers:[profile(),profile({id:'disconnected',instagramUserId:'',available:false,capabilities:null})]});
  try {
    assert.equal(app.doc.querySelector('option[value="disconnected"]').disabled,true);
    assert.equal(app.posts().length,0);
    await app.select();
    await app.click('Consultar destaques');
    assert.equal(app.posts().length,1);
    assert.deepEqual(app.posts()[0].target,targetOf(profile()));
  } finally {await app.close();}
});
test('complete list, explicit name/profile confirmation, single command and completed receipt',async()=>{
  const app=await mount();try{
    await app.list();assert.equal(app.posts().length,1);assert.equal(app.posts()[0].action,'list');
    await app.click('Excluir');assert.match(app.doc.querySelector('.confirmation').textContent,/@perfil.exemplo.a/);assert.match(app.doc.querySelector('.confirmation').textContent,/Bastidores/);
    assert.equal(app.doc.activeElement.textContent,'Excluir este destaque?');assert.equal(app.button('Confirmar exclusão').disabled,true);assert.equal(app.posts().length,1);
    await app.clickNode(app.doc.querySelector('.confirmation input'));
    await act(async()=>{app.button('Confirmar exclusão').click();app.button('Confirmar exclusão').click();});await settle();
    assert.equal(app.posts().length,2);const body=app.posts()[1];assert.equal(body.confirmed,true);assert.equal(body.confirmedTitle,'Bastidores');assert.equal(body.highlightId,'highlight:123');assert.equal(body.listOperationId,'operation-1');assert.deepEqual(body.target,targetOf(profile()));assert.match(body.requestId,/^[0-9a-f-]{36}$/i);
    assert.notEqual(body.requestId,app.posts()[0].requestId);
    app.set(s=>({...s,operations:s.operations.map(op=>op.action==='delete'?{...op,status:'completed',message:'deleted',completedAt:new Date(start).toISOString()}:op)}));await app.refresh();
    assert.match(app.doc.querySelector('.receipts').textContent,/Exclusão confirmada pelo navegador/);assert.equal(app.button('Excluir').disabled,true);
  }finally{await app.close();}
});
test('cancel and Escape restore focus without deleting',async()=>{
  const app=await mount();try{
    await app.list();await app.click('Excluir');await app.click('Cancelar');assert.equal(app.doc.querySelector('.confirmation'),null);assert.equal(app.doc.activeElement,app.button('Excluir'));
    await app.click('Excluir');await act(async()=>app.doc.dispatchEvent(new app.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));await settle();
    assert.equal(app.doc.querySelector('.confirmation'),null);assert.equal(app.doc.activeElement,app.button('Excluir'));assert.equal(app.posts().length,1);
  }finally{await app.close();}
});
test('empty list is explicit; failed list is never presented as empty',async()=>{
  const app=await mount();try{
    await app.list([]);assert.match(app.doc.querySelector('.results').textContent,/Nenhum destaque encontrado nesta consulta completa/);
    await app.click('Consultar destaques');app.set(s=>({...s,operations:s.operations.map(op=>({...op,status:'failed',message:'read_failed',highlights:undefined}))}));await app.refresh();
    assert.match(app.doc.querySelector('.results').textContent,/não significa que o perfil não tenha destaques/);assert.doesNotMatch(app.doc.querySelector('.results').textContent,/Nenhum destaque encontrado/);
  }finally{await app.close();}
});
test('malformed, incomplete and duplicate highlight lists block actions and preserve last valid data',async()=>{
  for(const malformed of [{highlights:undefined},{highlights:[highlight,highlight]},{highlights:[{id:'media:1',title:'Inválido'}]}]){
    const app=await mount();try{
      await app.list();app.set(s=>({...s,operations:s.operations.map(op=>({...op,...malformed}))}));await app.refresh();
      assert.match(app.doc.body.textContent,/dados anteriores foram preservados/);assert.match(app.doc.querySelector('.results').textContent,/Bastidores/);assert.equal(app.button('Excluir').disabled,true);assert.equal(app.button('Consultar destaques').disabled,true);
    }finally{await app.close();}
  }
});
test('list expiry is checked again on confirm even without a timer render',async()=>{
  const app=await mount();try{
    await app.list();await app.click('Excluir');await app.clickNode(app.doc.querySelector('.confirmation input'));app.advance(120001);
    await app.click('Confirmar exclusão');assert.equal(app.posts().length,1);
    await app.refresh();assert.match(app.doc.querySelector('.results').textContent,/Consulta expirada/);assert.equal(app.button('Excluir').disabled,true);
  }finally{await app.close();}
});
test('session/identity replacement cannot reuse selected profile or confirmation',async()=>{
  for(const replacement of [{sessionId:'session-new'},{instagramUserId:'909'},{capabilities:{highlightManagement:0}},{available:false}]){
    const app=await mount();try{
      await app.list();await app.click('Excluir');await app.clickNode(app.doc.querySelector('.confirmation input'));
      app.set(s=>({...s,browsers:[profile(replacement)]}));await app.refresh();await app.click('Confirmar exclusão');
      assert.equal(app.posts().length,1);assert.equal(app.button('Confirmar exclusão').disabled,true);
    }finally{await app.close();}
  }
});
test('switching profile hides previous list/confirmation; no cross-profile delete',async()=>{
  const app=await mount({browsers:[profile(),profile({id:'browser-b',sessionId:'session-b',instagramUserId:'202',label:'@perfil.exemplo.b'})]});try{
    await app.list();await app.click('Excluir');await app.select('browser-b');
    assert.equal(app.doc.querySelector('.confirmation'),null);assert.doesNotMatch(app.doc.querySelector('.results').textContent,/Bastidores/);assert.equal(app.posts().length,1);
  }finally{await app.close();}
});
test('read failure cancels confirmation, preserves receipt and blocks mutations',async()=>{
  let fail=false;const app=await mount({fetcher:call=>{if(fail&&call.method==='GET')throw Error('offline');}});try{
    await app.list();await app.click('Excluir');fail=true;await app.refresh();
    assert.equal(app.doc.querySelector('.confirmation'),null);assert.match(app.doc.querySelector('.receipts').textContent,/Consulta completa recebida/);assert.equal(app.button('Excluir').disabled,true);assert.equal(app.posts().length,1);
  }finally{await app.close();}
});
test('POST timeout/transport loss preserves intent, never retries and reconciles only via GET',async()=>{
  let rejectDelete=true;const app=await mount({fetcher:call=>{if(call.method==='POST'&&JSON.parse(call.body).action==='delete'&&rejectDelete)throw Error('lost response');}});try{
    await app.list();await app.confirm();assert.equal(app.posts().length,2);assert.match(app.doc.body.textContent,/Recebimento não confirmado/);
    await app.refresh();await app.tick();assert.equal(app.posts().length,2);assert.equal(app.button('Consultar destaques').disabled,true);
    const body=app.posts()[1];app.set(s=>({...s,operations:[{id:'uncertain-receipt',requestId:body.requestId,action:'delete',target:body.target,label:'@perfil.exemplo.a',highlightId:body.highlightId,highlightTitle:body.confirmedTitle,status:'uncertain',message:'execution_uncertain',createdAt:new Date(start).toISOString()},...s.operations]}));rejectDelete=false;
    await app.refresh();assert.doesNotMatch(app.doc.body.textContent,/Recebimento não confirmado/);assert.match(app.doc.querySelector('.receipts').textContent,/Resultado incerto/);
    await app.click('Consultar destaques');await app.completeList();assert.equal(app.button('Excluir').disabled,true);assert.equal(app.posts().filter(p=>p.action==='delete').length,1);
  }finally{await app.close();}
});
test('malformed or foreign write receipt is uncertain, never success',async()=>{
  for(const response of [json({operation:{status:'completed'}},202),json({error:'timeout'},502)]){
    const app=await mount({fetcher:call=>call.method==='POST'?response:undefined});try{
      await app.select();await app.click('Consultar destaques');assert.match(app.doc.body.textContent,/Recebimento não confirmado/);assert.equal(app.posts().length,1);await app.tick();assert.equal(app.posts().length,1);
    }finally{await app.close();}
  }
});
test('double click while POST pending sends once; unmount ignores late receipt',async()=>{
  const pending=defer();const app=await mount({fetcher:call=>call.method==='POST'?pending.promise:undefined});try{
    await app.select();await act(async()=>{app.button('Consultar destaques').click();app.button('Consultar destaques').click();});await settle();assert.equal(app.posts().length,1);
    const sent=app.calls.find(c=>c.method==='POST');await app.unmount();assert.equal(sent.signal.aborted,true);
    await act(async()=>pending.resolve(json({operation:{}},202)));await settle();assert.equal(app.doc.querySelector('#root').textContent,'');
  }finally{await app.close();}
});
test('scope remount cancels read and does not expose late previous identity data',async()=>{
  const pending=defer();let count=0;const app=await mount({fetcher:call=>call.url===endpoint&&call.method==='GET'&&++count===1?pending.promise:undefined});try{
    const first=app.calls[0];app.set({browsers:[],operations:[],serverTime:start});await app.changeScope('different-user:same-workspace');
    assert.equal(first.signal.aborted,true);await act(async()=>pending.resolve(json({browsers:[profile({label:'PRIVATE OLD IDENTITY'})],operations:[],serverTime:start})));await settle();
    assert.doesNotMatch(app.doc.body.textContent,/PRIVATE OLD IDENTITY/);assert.match(app.doc.body.textContent,/Nenhum perfil próprio/);assert.equal(app.posts().length,0);
  }finally{await app.close();}
});
test('401/403 revokes controls and no operation is retried',async()=>{
  for(const status of [401,403]){
    let deny=false,revoked=0;const app=await mount({onAccessRevoked:()=>revoked++,fetcher:call=>deny&&call.method==='GET'?json({},status):undefined});try{
      await app.list();deny=true;await app.refresh();assert.equal(revoked,1);assert.equal(app.doc.querySelector('select'),null);await app.tick();assert.equal(app.posts().length,1);
    }finally{await app.close();}
  }
});
test('server rejection is not a completed deletion or an automatic retry',async()=>{
  const app=await mount({fetcher:call=>call.method==='POST'&&JSON.parse(call.body).action==='delete'?json({code:'stale_list'},409):undefined});try{
    await app.list();await app.confirm();assert.match(app.doc.body.textContent,/Esta consulta expirou/);assert.equal(app.posts().length,2);await app.refresh();await app.tick();assert.equal(app.posts().length,2);assert.doesNotMatch(app.doc.body.textContent,/Exclusão confirmada pelo navegador/);
  }finally{await app.close();}
});
test('untrusted title is rendered as text and confirmation preserves exact empty title',async()=>{
  for(const title of ['<img src=x onerror=alert(1)>','']){
    const app=await mount();try{
      await app.list([{...highlight,title}]);assert.equal(app.doc.querySelector('.results img'),null);await app.confirm();assert.equal(app.posts()[1].confirmedTitle,title);
    }finally{await app.close();}
  }
});
