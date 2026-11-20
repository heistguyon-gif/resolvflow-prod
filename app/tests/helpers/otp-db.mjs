import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

export function loadTs(path, dependencies = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(path,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(source,{exports,require(name){
    const key = name.split("/").at(-1);
    if (!Object.hasOwn(dependencies,key)) throw new Error(`Unexpected dependency ${name}`);
    return dependencies[key];
  },crypto,TextEncoder,Uint8Array,Response,Request,Headers,URL,AbortSignal,Date,setTimeout,clearTimeout,fetch,btoa,atob});
  return exports;
}

export function fixtureDb(balance = 3000) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE otp_wallets (workspace_owner_user_id TEXT PRIMARY KEY,balance_cents INTEGER,updated_at TEXT);
    CREATE TABLE otp_ledger (id TEXT PRIMARY KEY,workspace_owner_user_id TEXT,actor_user_id TEXT,type TEXT,amount_cents INTEGER,balance_after_cents INTEGER,ref_id TEXT,summary TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE otp_supplier_apis (id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE app_users(id TEXT PRIMARY KEY,email TEXT,display_name TEXT);
    CREATE TABLE otp_inbox (id TEXT PRIMARY KEY,account_user_id TEXT,workspace_owner_user_id TEXT,supplier_api_id TEXT,order_id TEXT,email TEXT,product TEXT,status TEXT,price TEXT,codes_json TEXT DEFAULT '[]',closed INTEGER DEFAULT 0,hidden_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO otp_wallets VALUES ('workspace',${balance},NULL);`);
  sqlite.exec(readFileSync(new URL("../../drizzle/0044_otp_reliable_orders.sql",import.meta.url),"utf8"));
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {values:[],bind(...values){this.values=values;return this;},
        async first(){return statement.get(...this.values)||null;},
        async all(){return {results:statement.all(...this.values)};},
        async run(){return {meta:statement.run(...this.values)};}};
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try { const result=[];for (const stmt of statements) result.push(await stmt.run());sqlite.exec("COMMIT");return result; }
      catch(error){sqlite.exec("ROLLBACK");throw error;}
    },
  };
  return {db,sqlite,balance:()=>sqlite.prepare("SELECT balance_cents AS balance FROM otp_wallets").get().balance};
}

export const storeModule = loadTs("../../lib/otp-order-store.ts");
export const coordinatorModule = loadTs("../../lib/otp-provider-coordinator.ts");
export const serviceModule = loadTs("../../lib/otp-order-service.ts",{"otp-order-store":storeModule,"otp-provider-coordinator":coordinatorModule});
export function operation(store, overrides = {}) {
  return store.create({id:"operation",requestId:"request",accountUserId:"actor",workspaceOwnerUserId:"workspace",quantity:1,unitCents:300,provider:"instacaster",supplierApiId:null,...overrides});
}
