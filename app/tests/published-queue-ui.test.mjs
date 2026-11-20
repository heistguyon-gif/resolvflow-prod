import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {createRequire} from 'node:module';
import {loadStoryModule} from './helpers/story-modules.mjs';
import {renderDashboardRow,dashboardPublishedGate} from './helpers/published-queue-modules.mjs';

const css={__esModule:true,default:new Proxy({},{get:(_o,p)=>String(p)})};
const {PublishedQueueItem}=loadStoryModule('app/components/PublishedQueueItem.tsx',{'./PublishedQueueItem.module.css':css});
const helpers=loadStoryModule('app/components/publishedQueuePresentation.ts');
const {publishedInstagramUrl,publishedQueueMetric,isPublishedQueuePilot}=helpers;
const require=createRequire(process.env.PUBLISHED_UI_JSDOM_PACKAGE||new URL('../../hotmail-export-20261112-candidate/.integration/ui-runtime/package.json',import.meta.url));
const {JSDOM}=require('jsdom');
const post={id:'internal-graph-id-123',status:'published',username:'perfil.exemplo',campaignName:'Campanha de exemplo',mediaType:'REELS',captionOverride:'Uma legenda preparada para revisão.',publishedPermalink:'https://www.instagram.com/reel/Exemplo_123/',publishedAt:'2026-11-16T12:00:00Z',scheduledFor:'2026-11-16T11:58:00Z',mediaViews:12480,mediaReach:9420,insightsSyncedAt:'2026-11-16T12:30:00Z',attemptCount:1,maxAttempts:5};

async function mount(Component,props){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.test',pretendToBeVisual:true}),original=new Map(),errors=[],requests=[],opened=[];
 function set(key,value){original.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 for(const key of ['window','document','HTMLElement','navigator'])set(key,key==='window'?dom.window:key==='document'?dom.window.document:dom.window[key]);
 set('IS_REACT_ACT_ENVIRONMENT',true);set('fetch',(...args)=>{requests.push(args);throw Error('No network allowed');});dom.window.open=(...args)=>{opened.push(args);return null;};
 const error=console.error;console.error=(...args)=>errors.push(args);
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));
 const render=async p=>act(async()=>root.render(React.createElement(Component,p)));
 await render(props);
 return{dom,render,requests,opened,async close(){await act(async()=>root.unmount());console.error=error;dom.window.close();for(const[key,descriptor]of original)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];assert.deepEqual(errors,[]);}};
}

test('permalink accepts only HTTPS Instagram publication paths and strips query/fragment values',()=>{
 for(const host of ['instagram.com','www.instagram.com','m.instagram.com'])for(const kind of ['p','reel','tv']){
  assert.equal(publishedInstagramUrl('https://'+host+'/'+kind+'/AbC_123-/?access_token=synthetic-secret#private'),'https://'+host+'/'+kind+'/AbC_123-/');
 }
 assert.equal(publishedInstagramUrl('https://www.instagram.com/stories/perfil.exemplo/1234567890/'),'https://www.instagram.com/stories/perfil.exemplo/1234567890/');
});

test('permalink rejects hostile origins, credentials, schemes and non-publication paths; IDs never become URLs',()=>{
 for(const value of [null,undefined,123,'','17900001234567890','container-123','javascript:alert(1)','data:text/html,fixture','//www.instagram.com/p/a/','/p/a/','http://www.instagram.com/p/a/','https://instagram.com.evil.test/p/a/','https://evil.test/p/a/','https://instagram.com@evil.test/p/a/','https://user:secret@instagram.com/p/a/','https://instagram.com:8443/p/a/','https://instagram.com/accounts/login/','https://instagram.com/perfil/','https://instagram.com/p/a/extra','https://instagram.com/p/%2F/','https://instagram.com\\@evil.test/p/a/','https://www.insta\ngram.com/p/a/'])assert.equal(publishedInstagramUrl(value),null,String(value));
});

test('metrics distinguish default zero before sync, confirmed zero, partial positives and unknown values',()=>{
 assert.equal(publishedQueueMetric(0,null),null);assert.equal(publishedQueueMetric(0,'invalid'),null);
 assert.equal(publishedQueueMetric(0,post.insightsSyncedAt),'0');assert.equal(publishedQueueMetric(12480,null),'12.480');
 for(const value of [null,undefined,-1,NaN,Infinity,'0',1.5])assert.equal(publishedQueueMetric(value,post.insightsSyncedAt),null);
});

test('real dashboard gate requires Lucas AND Publicadas, irrespective of readabilityVisual or role',()=>{
 for(const [email,expected]of [['lucasbgn.affiliate@gmail.com',true],[' LUCASBGN.AFFILIATE@GMAIL.COM ',true],['soaresyago-_-@hotmail.com',false],['admin@example.test',false],[undefined,false]]){
  for(const tab of ['published','live','failed'])assert.equal(dashboardPublishedGate({Tt:tab,ha:{currentUser:{email,role:'owner',readabilityVisual:true}},isPublishedQueuePilot}),expected&&tab==='published');
 }
 assert.equal(dashboardPublishedGate({Tt:'published',ha:null,isPublishedQueuePilot}),false);
});

test('real dashboard mapping renders new component only for pilot published rows; legacy actions remain in other branches',()=>{
 const context={_:jsxRuntime,PublishedQueueItem,publishedQueuePreview:true,C:v=>String(v),T:v=>v,window:{open(){}},ll(){throw Error('Recovery must not run');},Bs:false};
 const pilot=renderDashboardRow(context)(post);assert.equal(pilot.type,PublishedQueueItem);assert.equal(pilot.props.publication,post);
 const legacy=renderDashboardRow({...context,publishedQueuePreview:false})(post);assert.equal(legacy.type,'article');
 const text=JSON.stringify(legacy);assert.match(text,/Abrir post/);assert.ok(!text.includes('PublishedQueueItem'));
 const failed=renderDashboardRow(context)({...post,status:'failed'});assert.equal(failed.type,'article');assert.match(JSON.stringify(failed),/Somente leitura/);
});

test('published component displays separate account/caption/metrics and only validated direct link; no fetch on mount',async()=>{
 const ui=await mount(PublishedQueueItem,{publication:{...post,publishedPermalink:post.publishedPermalink+'?access_token=synthetic-secret#private'}});
 try{const doc=ui.dom.window.document;assert.equal(doc.querySelector('h3').textContent,'@perfil.exemplo');assert.match(doc.body.textContent,/Legenda preparada/);assert.deepEqual([...doc.querySelectorAll('.metrics dd')].map(n=>n.textContent),['12.480','9.420']);
 const link=doc.querySelector('a');assert.equal(link.href,post.publishedPermalink);assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');assert.match(link.getAttribute('aria-label'),/nova aba/);assert.ok(!doc.body.innerHTML.includes('synthetic-secret'));assert.equal(ui.requests.length,0);assert.equal(ui.opened.length,0);
 }finally{await ui.close();}
});

test('missing/unsafe permalink always keeps an explained disabled action; neither caption nor media ID triggers recovery',async()=>{
 const ui=await mount(PublishedQueueItem,{publication:{...post,publishedPermalink:null,publishedMediaId:'17900001234567890'}});
 try{for(const value of [null,'javascript:alert(1)','https://evil.test/p/real/']){
 await ui.render({publication:{...post,publishedPermalink:value,publishedMediaId:'17900001234567890'}});
 const doc=ui.dom.window.document,button=[...doc.querySelectorAll('button')].find(n=>n.textContent==='Abrir publicação');
 assert.ok(button.disabled);assert.ok(doc.getElementById(button.getAttribute('aria-describedby')));assert.equal(doc.querySelector('a'),null);await act(async()=>button.click());}
 assert.equal(ui.requests.length,0);assert.equal(ui.opened.length,0);
 }finally{await ui.close();}
});

test('long caption expands/retracts through accessible control without HTML interpretation or network',async()=>{
 const caption='<img src=x onerror=alert(1)> '+('Legenda longa. '.repeat(70))+'\nÚltima linha visível ao expandir.';
 const ui=await mount(PublishedQueueItem,{publication:{...post,captionOverride:caption}});
 try{const doc=ui.dom.window.document,button=doc.querySelector('.expand'),paragraph=doc.getElementById(button.getAttribute('aria-controls'));
 assert.equal(button.getAttribute('aria-expanded'),'false');assert.equal(paragraph.textContent,caption);assert.equal(doc.querySelector('img'),null);
 await act(async()=>button.click());assert.equal(button.getAttribute('aria-expanded'),'true');assert.equal(paragraph.dataset.expanded,'true');
 await act(async()=>button.click());assert.equal(button.getAttribute('aria-expanded'),'false');assert.equal(ui.requests.length,0);
 }finally{await ui.close();}
});

test('unknown publication date is never replaced by schedule; zero/unknown and persisted notices stay distinct',async()=>{
 const ui=await mount(PublishedQueueItem,{publication:{...post,publishedAt:null,captionOverride:'',mediaViews:0,mediaReach:null,insightsSyncedAt:null,lastError:'Sem legenda',insightsError:'Erro access_token=synthetic-secret'}});
 try{const doc=ui.dom.window.document;assert.match(doc.body.textContent,/Horário de publicação não informado/);assert.equal(doc.querySelector('.publicationTime time'),null);assert.deepEqual([...doc.querySelectorAll('.metrics dd')].map(n=>n.textContent),['—','—']);assert.match(doc.body.textContent,/Nenhuma legenda preparada/);assert.match(doc.body.textContent,/Sem legenda/);assert.ok(!doc.body.innerHTML.includes('synthetic-secret'));
 await ui.render({publication:{...post,mediaViews:0,mediaReach:0,insightsError:'Falha de leitura posterior'}});
 assert.deepEqual([...doc.querySelectorAll('.metrics dd')].map(n=>n.textContent),['0','0']);assert.match(doc.body.textContent,/Última leitura completa/);assert.match(doc.body.textContent,/Falha de leitura posterior/);
 }finally{await ui.close();}
});

test('non-published statuses never render a published card or opening link',async()=>{
 const ui=await mount(PublishedQueueItem,{publication:{...post,status:'pending'}});
 try{for(const status of ['pending','processing','failed','cancelled','blocked']){await ui.render({publication:{...post,status}});assert.equal(ui.dom.window.document.querySelector('article'),null);}assert.equal(ui.requests.length,0);}finally{await ui.close();}
});
