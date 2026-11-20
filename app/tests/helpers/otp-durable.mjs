import {DatabaseSync} from 'node:sqlite';
import {loadTs} from './otp-db.mjs';
export const module=loadTs('../../lib/otp-durable-purchase.ts');
export function memoryBucket(){
 const rows=new Map();let seq=0,failWrites=0;
 return {rows,set failWrites(n){failWrites=n;},async get(key){const x=rows.get(key);return x?{etag:x.etag,json:async()=>JSON.parse(x.body)}:null;},
 async put(key,body,options={}){if(failWrites>0){failWrites--;throw new Error('storage interrupted');}const x=rows.get(key),c=options.onlyIf;if(c?.etagMatches&&c.etagMatches!==x?.etag||c?.etagDoesNotMatch==='*'&&x)return null;const etag=String(++seq);rows.set(key,{body,etag});return {etag};},
 async delete(key){rows.delete(key);},async list({prefix}){return {objects:[...rows.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key})),truncated:false};},
 expire(){for(const [key,x] of rows)if(key.endsWith('.json')){const j=JSON.parse(x.body);j.lockUntil=0;rows.set(key,{...x,body:JSON.stringify(j)});}},
 };
}
export function fixture(balance=4150){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(`CREATE TABLE otp_wallets(workspace_owner_user_id TEXT PRIMARY KEY,balance_cents INTEGER,updated_at TEXT);
 CREATE TABLE otp_ledger(id TEXT PRIMARY KEY,workspace_owner_user_id TEXT,actor_user_id TEXT,type TEXT,amount_cents INTEGER,balance_after_cents INTEGER,ref_id TEXT,summary TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE otp_inbox(id TEXT PRIMARY KEY,account_user_id TEXT,workspace_owner_user_id TEXT,supplier_api_id TEXT,order_id TEXT,email TEXT,product TEXT,status TEXT,price TEXT,codes_json TEXT DEFAULT '[]',closed INTEGER DEFAULT 0,hidden_at TEXT,created_at TEXT,updated_at TEXT);
 CREATE TABLE audit_events(id TEXT PRIMARY KEY,owner_user_id TEXT,actor_user_id TEXT,actor_email TEXT,action TEXT,entity_type TEXT,entity_id TEXT,summary TEXT,metadata_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 INSERT INTO otp_wallets VALUES('workspace',${balance},NULL);
 INSERT INTO otp_inbox(id,account_user_id,workspace_owner_user_id,order_id,email,codes_json,closed) VALUES('historical','actor','workspace','old-order','old@example.test','[{"code":"123456"}]',1);`);
 const db={prepare(sql){const stmt=sqlite.prepare(sql);return {args:[],bind(...args){this.args=args;return this;},async first(){return stmt.get(...this.args)||null;},async all(){return {results:stmt.all(...this.args)};},async run(){return {meta:stmt.run(...this.args)};}};},async batch(stmts){sqlite.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const bucket=memoryBucket(),store=new module.DurableOtpPurchases(db,bucket,'workspace','actor','wgb@example.test');
 return {sqlite,db,bucket,store,balance:()=>sqlite.prepare('SELECT balance_cents AS n FROM otp_wallets').get().n};
}
export const empty={order:null,failure:{status:409,data:{error:{code:'OUT_OF_STOCK'}}}};
export function providers(buy){return {tryAllPriorities:true,key:p=>'secret-'+p,buy,stockFailure:(_status,data)=>data?.error?.code==='OUT_OF_STOCK'};}
export const delivered=(id='og_abcdefghi')=>({order:{order_id:id,email:'mail@example.test',status:'active'},failure:null});
