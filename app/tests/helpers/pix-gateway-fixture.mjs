import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {runInNewContext} from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
export function loadPix(path,overrides={}){
 const full=resolve(path),exports={};
 const code=ts.transpileModule(readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(code,{exports,require(name){if(Object.hasOwn(overrides,name))return overrides[name];if(!name.startsWith('.'))throw Error('Unexpected dependency');return loadPix(resolve(dirname(full),name)+'.ts',overrides);},
  crypto,TextEncoder,TextDecoder,Uint8Array,URL,URLSearchParams,Headers,Request,Response,AbortSignal,Date,Error,Map,Set,fetch(){throw Error('REAL NETWORK FORBIDDEN');}});
 return exports;
}
export function bucket(){let seq=0;const rows=new Map();return{rows,async get(key){const row=rows.get(key);return row?{etag:row.etag,json:async()=>JSON.parse(row.body)}:null;},async put(key,body,{onlyIf}={}){const old=rows.get(key);if(onlyIf?.etagMatches&&old?.etag!==onlyIf.etagMatches||onlyIf?.etagDoesNotMatch==='*'&&old)return null;const etag=String(++seq);rows.set(key,{etag,body});return{etag};}};}
// Real AES-GCM with a synthetic in-memory key; ciphertext assertions are meaningful.
export async function codec(){const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);return{async encrypt(text){const iv=crypto.getRandomValues(new Uint8Array(12)),bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(text));return{ciphertext:Buffer.from(bytes).toString('base64'),iv:Buffer.from(iv).toString('base64')};},async decrypt(c,i){return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(i,'base64')},key,Buffer.from(c,'base64')));}};}
export function database(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(`
 CREATE TABLE otp_payments(id TEXT PRIMARY KEY,workspace_owner_user_id TEXT,actor_user_id TEXT,provider TEXT,provider_payment_id TEXT,amount_cents INTEGER,gmail_count INTEGER DEFAULT 0,status TEXT,qr_code TEXT,ticket_url TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,paid_at TEXT,UNIQUE(provider,provider_payment_id));
 CREATE TABLE otp_wallets(workspace_owner_user_id TEXT PRIMARY KEY,balance_cents INTEGER DEFAULT 0,updated_at TEXT);
 CREATE TABLE otp_ledger(id TEXT PRIMARY KEY,workspace_owner_user_id TEXT,actor_user_id TEXT,type TEXT,amount_cents INTEGER,balance_after_cents INTEGER,ref_id TEXT,summary TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE otp_pix_webhook_events(event_id TEXT PRIMARY KEY,event_type TEXT,provider_payment_id TEXT,status TEXT,processed_at TEXT,last_error TEXT);
 `);let tail=Promise.resolve();
 const db={prepare(sql){const s=sqlite.prepare(sql);return{values:[],bind(...values){this.values=values;return this;},async first(){return s.get(...this.values)||null;},async run(){return{meta:s.run(...this.values)};}};},batch(statements){const next=tail.then(async()=>{sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}});tail=next.catch(()=>{});return next;}};
 return{db,sqlite,balance:()=>sqlite.prepare('SELECT coalesce(sum(balance_cents),0) n FROM otp_wallets').get().n};
}
export const configModule=loadPix('lib/pix-gateway-config.ts');
export const adapterModule=loadPix('lib/pix-gateway-adapters.ts',{'./pix-gateway-config':configModule});
export const paymentsModule=loadPix('lib/pix-gateway-payments.ts',{'./pix-gateway-config':configModule,'./pix-gateway-adapters':adapterModule});
export async function sign(raw,secret,t=Math.floor(Date.now()/1000)){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${t}.${raw}`))).toString('hex');return `t=${t},v1=${signature}`;}
