import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import React,{act} from 'react';
const {JSDOM}=createRequire(process.env.MAIL_UI_JSDOM_PACKAGE||new URL('../../../hotmail-export-20261112-candidate/.integration/ui-runtime/package.json',import.meta.url))('jsdom');
export const css={__esModule:true,default:new Proxy({},{get:(_object,name)=>String(name)})};
export const flush=()=>act(async()=>{for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r));});
export function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{resolve,promise};}
export async function mount(Component,props,fetcher){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.test/',pretendToBeVisual:true});
 const previous=new Map(),requests=[],logs=[],copied=[];
 function set(key,value){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 for(const key of ['window','document','HTMLElement','HTMLInputElement','localStorage','navigator'])set(key,key==='window'?dom.window:key==='document'?dom.window.document:dom.window[key]);
 set('requestAnimationFrame',dom.window.requestAnimationFrame.bind(dom.window));set('cancelAnimationFrame',dom.window.cancelAnimationFrame.bind(dom.window));set('IS_REACT_ACT_ENVIRONMENT',true);
 Object.defineProperty(dom.window.navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copied.push(text);}}});
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 set('fetch',async(url,init)=>{assert.ok(String(url).startsWith('/api/own-emails'),'fixture allows reader API only');const req={url:String(url),body:init?.body?JSON.parse(init.body):undefined,signal:init?.signal};requests.push(req);return fetcher?fetcher(req):Response.json({accounts:[]});});
 const originalError=console.error;console.error=(...args)=>logs.push(args);
 const {createRoot}=await import('react-dom/client');let root=createRoot(dom.window.document.getElementById('root')),current=props;
 const render=async next=>{current=next;await act(async()=>root.render(React.createElement(Component,next)));await flush();};
 await render(props);
 const find=text=>[...dom.window.document.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
 return {dom,requests,copied,logs,find,render,props:()=>current,
  click:async text=>{const node=find(text);assert.ok(node,'button exists: '+text);await act(async()=>node.click());await flush();},
  selectAccount:async email=>{const node=dom.window.document.querySelector('label[aria-label="Selecionar caixa '+email+'"] input');assert.ok(node,'account exists');await act(async()=>node.click());await flush();},
  value:async(selector,value)=>{const node=dom.window.document.querySelector(selector);assert.ok(node,selector);const prototype=node.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;await act(async()=>{Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);node.dispatchEvent(new dom.window.Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));});await flush();},
  close:async()=>{if(root){await act(async()=>root.unmount());root=null;}dom.window.close();console.error=originalError;for(const[key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}assert.deepEqual(logs,[],'No runtime warnings');}
 };
}
