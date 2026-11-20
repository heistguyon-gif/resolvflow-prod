import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React,{act} from 'react';
const require=createRequire(import.meta.url);
const {JSDOM}=createRequire(process.env.PIX_UI_JSDOM_PACKAGE||new URL('../../../hotmail-export-20261112-candidate/.integration/ui-runtime/package.json',import.meta.url))('jsdom');
export const css={__esModule:true,default:new Proxy({},{get:(_object,name)=>String(name)})};
export function load(file,mocks={},cache=new Map()){
 const target=resolve(file);if(cache.has(target))return cache.get(target).exports;
 const output=ts.transpileModule(readFileSync(target,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const module={exports:{}};cache.set(target,module);
 const local=name=>{if(Object.hasOwn(mocks,name))return mocks[name];if(!name.startsWith('.'))return require(name);const base=resolve(dirname(target),name),next=[base,base+'.ts',base+'.tsx'].find(existsSync);return load(next,mocks,cache);};
 new Function('require','module','exports',output)(local,module,module.exports);return module.exports;
}
export const flush=()=>act(async()=>{for(let i=0;i<5;i++)await new Promise(r=>setTimeout(r,0));});
export function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{resolve,promise};}
export async function mount(Component,props,fetcher,options={}){
 const dom=new JSDOM('<div id="root"></div>',{url:options.url||'https://fixture.test/',pretendToBeVisual:true});
 const previous=new Map(),requests=[],logs=[];
 function set(key,value){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 for(const key of ['window','document','HTMLElement','HTMLInputElement','FormData','sessionStorage','localStorage','navigator'])set(key,key==='window'?dom.window:key==='document'?dom.window.document:dom.window[key]);
 for(const[key,value]of Object.entries(options.storage||{}))sessionStorage.setItem(key,value);
 set('IS_REACT_ACT_ENVIRONMENT',true);
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;this.querySelector('input,button')?.focus();};
 dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 set('fetch',async(url,init)=>{assert.ok(String(url).startsWith('/api/'),'No external transport in UI fixtures');const req={url:String(url),method:init?.method||'GET',body:init?.body?JSON.parse(init.body):undefined,signal:init?.signal};requests.push(req);if(!fetcher)throw Error('No transport fixture');return fetcher(req);});
 const originalError=console.error;console.error=(...args)=>logs.push(args);
 const {createRoot}=await import('react-dom/client');let root=createRoot(dom.window.document.getElementById('root'));
 const render=async next=>{await act(async()=>root.render(React.createElement(Component,next)));await flush();};await render(props);
 const find=(text,scope=dom.window.document)=>[...scope.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
 return {dom,requests,logs,find,render,
  async click(text,scope){const node=find(text,scope);assert.ok(node,'button exists: '+text);await act(async()=>node.click());await flush();},
  async submit(){await act(async()=>dom.window.document.querySelector('dialog form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));await flush();},
  async value(selector,value){const node=dom.window.document.querySelector(selector);assert.ok(node,selector);const prototype=node.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;await act(async()=>{Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);node.dispatchEvent(new dom.window.Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));});await flush();},
  async close(){if(root){await act(async()=>root.unmount());root=null;}dom.window.close();console.error=originalError;for(const[key,descriptor]of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];assert.deepEqual(logs,[],'No React runtime warnings');}
 };
}
export const lucas='lucasbgn.affiliate@gmail.com';
export const managedId='11111111-1111-4111-8111-111111111111';
export function fixtureState(){return{revision:'1',active:{configId:'legacy-leztypay',version:1},canManage:true,
 providers:[{id:'leztypay',label:'Lezty Pay',documentationUrl:'https://docs.leztypay.com/'},{id:'bravopay',label:'BravoPay',documentationUrl:'https://bravopay.club/docs'}],
 gateways:[...['leztypay','bravopay'].map(provider=>({id:'legacy-'+provider,label:provider==='leztypay'?'Lezty existente':'Bravo existente',provider,version:1,origin:'legacy',status:'configured',active:provider==='leztypay',activeVersion:provider==='leztypay'?1:null,hasApiKey:true,hasWebhookSecret:true,verification:'not_checked',createdAt:null,updatedAt:null,webhookUrl:'https://resolvflow.online/api/otp/pix/webhook'})),
 {id:managedId,label:'Bravo principal',provider:'bravopay',version:2,origin:'managed',status:'configured',active:false,activeVersion:null,hasApiKey:true,hasWebhookSecret:true,verification:'not_checked',createdAt:'2026-11-16T12:00:00Z',updatedAt:'2026-11-16T12:15:00Z',webhookUrl:'https://resolvflow.online/api/otp/pix/webhook?configId='+managedId+'&version=2'}]};}
