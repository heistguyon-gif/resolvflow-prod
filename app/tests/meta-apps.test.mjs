import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import * as drizzleOrm from "drizzle-orm";
import * as sqliteCore from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/d1";
import { loadPix, codec } from "./helpers/pix-gateway-fixture.mjs";
import { d1Sqlite } from "./helpers/d1-sqlite.mjs";

const registry = loadPix("lib/meta-app-registry.ts");
const schema = loadPix("db/schema.ts", { "drizzle-orm": drizzleOrm, "drizzle-orm/sqlite-core": sqliteCore });

// Production DDL (as read from D1 on 2026-11-20) + the new migration.
const BASE_DDL = `
CREATE TABLE meta_apps (id text PRIMARY KEY NOT NULL, label text NOT NULL, app_id text NOT NULL, secret_ciphertext text NOT NULL, secret_iv text NOT NULL, graph_version text NOT NULL, redirect_uri text DEFAULT '' NOT NULL, status text DEFAULT 'active' NOT NULL, created_by_user_id text, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);
CREATE TRIGGER meta_apps_app_id_no_new_duplicates BEFORE INSERT ON meta_apps WHEN EXISTS (SELECT 1 FROM meta_apps WHERE app_id = NEW.app_id) BEGIN SELECT RAISE(ABORT, 'meta_app_id_already_exists'); END;
CREATE TABLE meta_app_assignments (id text PRIMARY KEY NOT NULL, meta_app_id text NOT NULL, account_user_id text NOT NULL, workspace_owner_user_id text NOT NULL, status text DEFAULT 'active' NOT NULL, granted_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, revoked_at text, updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);
CREATE UNIQUE INDEX meta_app_assignments_target_uq ON meta_app_assignments (meta_app_id, account_user_id, workspace_owner_user_id);
CREATE TABLE meta_app_user_policies (account_user_id text NOT NULL, workspace_owner_user_id text NOT NULL, managed_at text DEFAULT CURRENT_TIMESTAMP NOT NULL);
CREATE UNIQUE INDEX meta_app_user_policies_target_uq ON meta_app_user_policies (account_user_id, workspace_owner_user_id);
CREATE TABLE meta_connections (id text PRIMARY KEY NOT NULL, owner_user_id text NOT NULL, instagram_user_id text NOT NULL, username text NOT NULL, account_type text, token_ciphertext text NOT NULL, token_iv text NOT NULL, token_expires_at text, scopes text DEFAULT '' NOT NULL, status text DEFAULT 'connected' NOT NULL, publishing_limit_used integer DEFAULT 0 NOT NULL, publishing_limit_total integer DEFAULT 100 NOT NULL, last_sync_at text, last_error text, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, meta_app_key text DEFAULT 'default', meta_app_id text);
INSERT INTO meta_apps (id,label,app_id,secret_ciphertext,secret_iv,graph_version) VALUES ('11111111-1111-4111-8111-111111111111','Catálogo plataforma','900000000001','x','y','v26.0');
`;
const MIGRATION = readFileSync("drizzle/0047_user_meta_apps.sql", "utf8").replaceAll("--> statement-breakpoint", "");

async function fixture(env = { META_GRAPH_VERSION: "v26.0" }) {
  const { sqlite, d1 } = d1Sqlite(BASE_DDL + MIGRATION);
  const crypt = await codec();
  const tokenCrypto = { encryptToken: (t) => crypt.encrypt(t), decryptToken: (c, i) => crypt.decrypt(c, i) };
  const db = { getDb: () => drizzle(d1, { schema }) };
  const workspaceMetaApps = { workspaceMetaAppKey: (id) => `workspace:${id}` };
  const lib = loadPix("lib/user-meta-apps.ts", {
    "drizzle-orm": drizzleOrm, "../db": db, "../db/schema": schema, "./token-crypto": tokenCrypto,
    "./runtime-env": { runtimeEnv: () => env }, "./meta-app-registry": registry, "./workspace-meta-apps": workspaceMetaApps,
  });
  return { sqlite, lib };
}
const WS = "ws-owner-1", OTHER = "ws-owner-2";
const input = { label: "App principal", appId: "123456789012345", appSecret: "a".repeat(32), accountUserId: "member-1", workspaceOwnerUserId: WS, origin: "https://resolvflow.online" };

test("migration 0047 is additive and keeps existing catalog rows as origin=platform", async () => {
  const { sqlite } = await fixture();
  const row = sqlite.prepare("SELECT origin, owner_workspace_user_id FROM meta_apps").get();
  assert.deepEqual({ ...row }, { origin: "platform", owner_workspace_user_id: null });
  assert.ok(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='meta_apps_owner_workspace_idx'").get());
});

test("register stores secret + verify token encrypted, assigns owner and member, marks them managed", async () => {
  const { sqlite, lib } = await fixture();
  const result = await lib.registerOwnMetaApp(input);
  assert.equal(result.ok, true);
  const row = sqlite.prepare("SELECT * FROM meta_apps WHERE id=?").get(result.id);
  assert.equal(row.origin, "user"); assert.equal(row.owner_workspace_user_id, WS); assert.equal(row.app_id, input.appId);
  assert.equal(row.redirect_uri, "https://resolvflow.online/api/meta/callback");
  const stored = JSON.stringify(row);
  assert.ok(!stored.includes(input.appSecret), "secret never stored in clear");
  assert.ok(!/rfv_[0-9a-f]{48}/.test(stored), "verify token never stored in clear");
  const assigned = sqlite.prepare("SELECT account_user_id FROM meta_app_assignments WHERE meta_app_id=? ORDER BY 1").all(result.id).map((r) => r.account_user_id);
  assert.deepEqual(assigned, ["member-1", WS]);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM meta_app_user_policies WHERE workspace_owner_user_id=?").get(WS).n, 2);
});

test("duplicate App ID (own or catalog) is refused with 409", async () => {
  const { lib } = await fixture();
  assert.equal((await lib.registerOwnMetaApp(input)).ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(await lib.registerOwnMetaApp({ ...input, label: "Outro" }))), { ok: false, status: 409, error: "Este App ID já está cadastrado na plataforma." });
  assert.equal((await lib.registerOwnMetaApp({ ...input, appId: "900000000001" })).status, 409);
});

test("listing is scoped to the workspace, hides catalog apps, and computes ativos/caídos", async () => {
  const { sqlite, lib } = await fixture();
  const { id } = await lib.registerOwnMetaApp(input);
  const other = await lib.registerOwnMetaApp({ ...input, appId: "222222222222", workspaceOwnerUserId: OTHER, accountUserId: "x" });
  const ins = sqlite.prepare("INSERT INTO meta_connections (id,owner_user_id,instagram_user_id,username,token_ciphertext,token_iv,status,token_expires_at,meta_app_key) VALUES (?,?,?,?,?,?,?,?,?)");
  const future = new Date(Date.now() + 86_400_000).toISOString(), past = new Date(Date.now() - 1000).toISOString();
  ins.run("c1", WS, "1", "a", "t", "i", "connected", future, `workspace:${id}`);
  ins.run("c2", WS, "2", "b", "t", "i", "connected", null, `workspace:${id}`);
  ins.run("c3", WS, "3", "c", "t", "i", "error", future, `workspace:${id}`);
  ins.run("c4", WS, "4", "d", "t", "i", "connected", past, `workspace:${id}`);
  ins.run("c5", WS, "5", "e", "t", "i", "archived", future, `workspace:${id}`);
  ins.run("c6", OTHER, "6", "f", "t", "i", "connected", future, `workspace:${id}`);
  ins.run("c7", WS, "7", "g", "t", "i", "connected", future, "operation_3");
  const apps = await lib.listOwnMetaApps(WS, { revealVerifyToken: true });
  assert.equal(apps.length, 1);
  assert.equal(apps[0].id, id);
  assert.deepEqual({ ...apps[0].health }, { total: 4, active: 2, down: 2 });
  assert.equal(apps[0].setup.webhookUrl, `https://resolvflow.online/api/meta/webhook/${id}`);
  assert.match(apps[0].setup.verifyToken, /^rfv_[0-9a-f]{48}$/);
  assert.equal(JSON.stringify(apps).includes(input.appSecret), false, "secret never returned");
  const viewer = await lib.listOwnMetaApps(WS, { revealVerifyToken: false });
  assert.equal(viewer[0].setup.verifyToken, null);
  assert.equal((await lib.listOwnMetaApps(OTHER, { revealVerifyToken: false }))[0].id, other.id);
});

test("status change is scoped to the owning workspace and never touches catalog apps", async () => {
  const { lib } = await fixture();
  const { id } = await lib.registerOwnMetaApp(input);
  assert.equal(await lib.setOwnMetaAppStatus(OTHER, id, "disabled"), null);
  assert.equal(await lib.setOwnMetaAppStatus(WS, "11111111-1111-4111-8111-111111111111", "disabled"), null);
  assert.equal((await lib.setOwnMetaAppStatus(WS, id, "disabled")).id, id);
  assert.equal(await lib.webhookCredentials(id), null, "disabled app has no webhook");
  await lib.setOwnMetaAppStatus(WS, id, "active");
  const creds = await lib.webhookCredentials(id);
  assert.equal(creds.appSecret, input.appSecret);
});

test("pure helpers: validation, health definition, setup URLs, scopes match the OAuth request", () => {
  assert.equal(registry.validateMetaAppInput({ label: "x", appId: "1", appSecret: "" }).ok, false);
  assert.equal(registry.validateMetaAppInput({ label: "Meu app", appId: "12a", appSecret: "a".repeat(32) }).ok, false);
  assert.deepEqual(JSON.parse(JSON.stringify(registry.validateMetaAppInput({ label: "  Meu   app ", appId: " 1234567 ", appSecret: "b".repeat(32) }))), { ok: true, value: { label: "Meu app", appId: "1234567", appSecret: "b".repeat(32) } });
  assert.deepEqual({ ...registry.connectionHealth([{ status: "connected", tokenExpiresAt: null }, { status: "error", tokenExpiresAt: null }, { status: "archived", tokenExpiresAt: null }]) }, { total: 2, active: 1, down: 1 });
  const metaApi = readFileSync("lib/meta-api.ts", "utf8");
  assert.match(metaApi, /url\.searchParams\.set\("scope", META_INSTAGRAM_SCOPES\.join\(","\)\)/);
  assert.deepEqual([...registry.META_INSTAGRAM_SCOPES], ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"]);
  assert.equal(registry.isMetaWebhookPath("/api/meta/webhook/11111111-1111-4111-8111-111111111111"), true);
  assert.equal(registry.isMetaWebhookPath("/api/meta/webhook/../admin"), false);
});

const ID = "33333333-3333-4333-8333-333333333333";
function webhookRoute(creds) {
  return loadPix("app/api/meta/webhook/[appRecordId]/route.ts", {
    "../../../../../lib/meta-app-registry": registry,
    "../../../../../lib/request-body": loadPix("lib/request-body.ts"),
    "../../../../../lib/user-meta-apps": { webhookCredentials: async (id) => (id === ID ? creds : null) },
  });
}
test("webhook GET answers the Meta challenge only with the app's verify token", async () => {
  const route = webhookRoute({ appSecret: "s".repeat(32), verifyToken: "rfv_ok", label: "x" });
  const url = (q) => `https://resolvflow.online/api/meta/webhook/${ID}?${q}`;
  const ok = await route.GET(new Request(url("hub.mode=subscribe&hub.verify_token=rfv_ok&hub.challenge=12345")));
  assert.equal(ok.status, 200); assert.equal(await ok.text(), "12345");
  assert.equal((await route.GET(new Request(url("hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1")))).status, 403);
  assert.equal((await route.GET(new Request(`https://resolvflow.online/api/meta/webhook/44444444-4444-4444-8444-444444444444?hub.mode=subscribe&hub.verify_token=rfv_ok&hub.challenge=1`))).status, 404);
});
test("webhook POST fails closed: unsigned / wrong signature 401, valid 200", async () => {
  const secret = "s".repeat(32);
  const route = webhookRoute({ appSecret: secret, verifyToken: "rfv_ok", label: "x" });
  const body = JSON.stringify({ object: "instagram", entry: [] });
  const post = (headers) => new Request(`https://resolvflow.online/api/meta/webhook/${ID}`, { method: "POST", headers, body });
  assert.equal((await route.POST(post({}))).status, 401);
  assert.equal((await route.POST(post({ "x-hub-signature-256": "sha256=" + createHmac("sha256", "other").update(body).digest("hex") }))).status, 401);
  assert.equal((await route.POST(post({ "x-hub-signature-256": "sha256=" + createHmac("sha256", secret).update(body).digest("hex") }))).status, 200);
});

function appsRoute(role, calls) {
  const ctx = { workspaceOwnerUserId: WS, accountUserId: "member-1", email: "m@x", role };
  const rank = { viewer: 1, editor: 2, owner: 3 };
  class AuthorizationError extends Error {}
  return loadPix("app/api/meta/apps/route.ts", {
    "../../../../lib/auth": {
      requireWorkspaceContext: async (_request, required) => { calls.push("role:" + required); if (rank[role] < rank[required]) throw new AuthorizationError("ro"); return ctx; },
      authErrorResponse: (error) => (error instanceof AuthorizationError ? Response.json({ error: "ro" }, { status: 403 }) : null),
    },
    "../../../../lib/audit": { recordAuditEvent: async (_r, event) => calls.push("audit:" + event.action) },
    "../../../../lib/meta-app-registry": registry,
    "../../../../lib/user-meta-apps": {
      listOwnMetaApps: async (ws, opts) => { calls.push(`list:${ws}:${opts.revealVerifyToken}`); return []; },
      registerOwnMetaApp: async (value) => { calls.push(`register:${value.workspaceOwnerUserId}:${value.appId}`); return { ok: true, id: "new" }; },
      setOwnMetaAppStatus: async (ws, id, status) => { calls.push(`status:${ws}:${id}:${status}`); return { id, label: "x" }; },
    },
  });
}
const jsonReq = (method, body) => new Request("https://resolvflow.online/api/meta/apps", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
test("apps API: viewers read without verify token; viewers cannot register; editors register/patch scoped to their workspace", async () => {
  let calls = [];
  const viewer = appsRoute("viewer", calls);
  const listed = await viewer.GET(new Request("https://resolvflow.online/api/meta/apps"));
  assert.equal(listed.status, 200);
  assert.deepEqual(calls, ["role:viewer", `list:${WS}:false`]);
  assert.equal((await viewer.POST(jsonReq("POST", { label: "App", appId: "1234567", appSecret: "a".repeat(32) }))).status, 403);
  calls = [];
  const editor = appsRoute("editor", calls);
  assert.equal((await editor.POST(jsonReq("POST", { label: "A", appId: "x", appSecret: "" }))).status, 400);
  assert.equal((await editor.POST(jsonReq("POST", { label: "App", appId: "1234567", appSecret: "a".repeat(32) }))).status, 201);
  assert.ok(calls.includes(`register:${WS}:1234567`) && calls.includes("audit:meta_app.user_register"));
  assert.equal((await editor.PATCH(jsonReq("PATCH", { id: "abc", status: "disabled" }))).status, 200);
  assert.ok(calls.includes(`status:${WS}:abc:disabled`));
  assert.equal((await editor.PATCH(jsonReq("PATCH", { id: "abc", status: "deleted" }))).status, 400);
});

test("worker exposes only the per-app webhook path publicly (GET/POST) and exempts it from the cross-site check", () => {
  const worker = readFileSync("worker/index.ts", "utf8");
  assert.match(worker, /isMetaWebhookPath\(pathname\) && \(method === "GET" \|\| method === "POST"\)\) return true;/);
  assert.match(worker, /isMetaWebhookPath\(pathname\) && request\.method === "POST"\) return false;/);
});
