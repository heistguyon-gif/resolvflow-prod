import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { ACTIVE_INVITE_MEMBER_SQL, automaticResubmitAction } from "../lib/meta-invite-membership.ts";

const migration = readFileSync(new URL("../drizzle/0042_meta_invite_controls.sql", import.meta.url), "utf8");
const agentRoute = readFileSync(new URL("../app/api/meta/invite-agent/route.ts", import.meta.url), "utf8");
const claimSql = agentRoute.match(/db\.prepare\(`(UPDATE connection_requests\s+[\s\S]*?RETURNING id, username, meta_app_key, invite_claim_token, invite_lease_until, invite_attempts)`\)/)?.[1];
const completeSql = agentRoute.match(/db\.prepare\(`(UPDATE connection_requests SET status = \?, invited_at = \?[\s\S]*?RETURNING id)`\)/)?.[1];
assert.ok(claimSql && completeSql, "as consultas testadas devem ser as usadas na rota");

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE connection_requests (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, requested_by_user_id TEXT NOT NULL,
    requested_by_email TEXT NOT NULL, username TEXT NOT NULL, meta_app_key TEXT NOT NULL, status TEXT NOT NULL,
    invited_at TEXT, invited_by_email TEXT, connected_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX connection_requests_owner_username_uq ON connection_requests(owner_user_id, username);
    CREATE TABLE meta_apps (id TEXT PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE meta_app_assignments (id TEXT PRIMARY KEY, meta_app_id TEXT NOT NULL, account_user_id TEXT NOT NULL,
      workspace_owner_user_id TEXT NOT NULL, status TEXT NOT NULL);
    CREATE TABLE app_users (id TEXT PRIMARY KEY, email TEXT NOT NULL);
    CREATE TABLE workspace_members (id TEXT PRIMARY KEY, account_user_id TEXT, email TEXT NOT NULL,
      workspace_owner_user_id TEXT NOT NULL, status TEXT NOT NULL);`);
  for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) db.exec(statement);
  return db;
}

function seed(db, id = "request-1", username = "perfil") {
  db.prepare("INSERT INTO meta_apps(id,status) VALUES (?,?) ON CONFLICT(id) DO NOTHING").run("record-1", "active");
  db.prepare("INSERT INTO meta_app_assignments VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING").run("assignment-1", "record-1", "actor-1", "workspace-1", "active");
  db.prepare("INSERT INTO meta_connection_modes(account_user_id,workspace_owner_user_id,mode) VALUES (?,?,?) ON CONFLICT DO NOTHING").run("actor-1", "workspace-1", "bot");
  db.prepare("INSERT INTO connection_requests(id,owner_user_id,requested_by_user_id,requested_by_email,username,meta_app_key,status,invite_mode,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(id, "workspace-1", "actor-1", "person@example.test", username, "workspace:record-1", "pending", "automatic", "2026-10-06T12:00:00.000Z", "2026-10-06T12:00:00.000Z");
}

const now = "2026-10-06T12:01:00.000Z";
const lease = "2026-10-06T12:03:00.000Z";
function claim(db, token = "claim-1", at = now, metaAppKey = "workspace:record-1") {
  return db.prepare(claimSql).get(token, lease, at, metaAppKey, at, metaAppKey, at);
}

test("0042 preserves manual default and platform default off", () => {
  const db = database();
  db.prepare("INSERT INTO connection_requests(id,owner_user_id,requested_by_user_id,requested_by_email,username,meta_app_key,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run("manual", "workspace-1", "actor-1", "person@example.test", "manual", "default", "pending", now, now);
  assert.equal(db.prepare("SELECT invite_mode FROM connection_requests WHERE id='manual'").get().invite_mode, "manual");
  seed(db);
  assert.equal(claim(db), undefined);
  db.close();
});

test("claim requires bot mode, active catalog assignment and global enable; claims at most one", () => {
  const db = database(); seed(db); seed(db, "request-2", "outro");
  db.exec("INSERT INTO meta_invite_platform_settings(key,enabled) VALUES ('bot_invite',1)");
  db.exec("UPDATE meta_connection_modes SET mode='standard'"); assert.equal(claim(db), undefined);
  db.exec("UPDATE meta_connection_modes SET mode='bot'; UPDATE meta_app_assignments SET status='revoked'"); assert.equal(claim(db), undefined);
  db.exec("UPDATE meta_app_assignments SET status='active'");
  assert.equal(claim(db, "other-app", now, "workspace:other-record"), undefined);
  const first = claim(db);
  assert.equal(first.id, "request-1");
  assert.equal(first.meta_app_key, "workspace:record-1");
  assert.equal(first.invite_attempts, 1);
  assert.equal(claim(db, "claim-2").id, "request-2");
  assert.equal(claim(db, "claim-3"), undefined);
  db.close();
});

test("lease reclaim invalidates old claim; only matching processing claim completes", () => {
  const db = database(); seed(db);
  db.exec("INSERT INTO meta_invite_platform_settings(key,enabled) VALUES ('bot_invite',1)");
  assert.equal(claim(db).invite_claim_token, "claim-1");
  db.exec("UPDATE connection_requests SET invite_lease_until='2026-10-06T11:59:00.000Z'");
  assert.equal(claim(db, "claim-2").invite_attempts, 2);
  const complete = db.prepare(completeSql);
  assert.equal(complete.get("invited", now, "bot", null, now, "request-1", "claim-1"), undefined);
  assert.equal(complete.get("invited", now, "bot", null, now, "request-1", "claim-2").id, "request-1");
  assert.equal(complete.get("invited", now, "bot", null, now, "request-1", "claim-2"), undefined);
  db.close();
});

test("failed completion records code without inviting", () => {
  const db = database(); seed(db);
  db.exec("INSERT INTO meta_invite_platform_settings(key,enabled) VALUES ('bot_invite',1)");
  claim(db);
  db.prepare(completeSql).get("failed", null, null, "exact_not_found", now, "request-1", "claim-1");
  const row = db.prepare("SELECT status,invite_last_error,invited_at FROM connection_requests WHERE id='request-1'").get();
  assert.deepEqual({ ...row }, { status: "failed", invite_last_error: "exact_not_found", invited_at: null });
  db.close();
});

test("a finished claim is recorded once and is not taken again", () => {
  const db = database(); seed(db);
  db.exec("INSERT INTO meta_invite_platform_settings(key,enabled) VALUES ('bot_invite',1)");
  claim(db);
  db.exec("UPDATE meta_invite_platform_settings SET enabled=0");
  const completed = db.prepare(completeSql).get("failed", null, null, "exact_not_found", now, "request-1", "claim-1");
  assert.equal(completed.id, "request-1");
  db.exec("UPDATE meta_invite_platform_settings SET enabled=1");
  assert.equal(claim(db, "claim-again"), undefined);
  db.close();
});

test("the same username can be asked again only after the current attempt left the queue", () => {
  assert.equal(automaticResubmitAction(undefined), "insert");
  assert.equal(automaticResubmitAction("pending"), "keep");
  assert.equal(automaticResubmitAction("processing"), "keep");
  assert.equal(automaticResubmitAction("failed"), "reopen");
  assert.equal(automaticResubmitAction("cancelled"), "reopen");
  assert.equal(automaticResubmitAction("invited"), "reopen");
});

test("mode target resolves active membership by ID or legacy case-insensitive email in exact workspace", () => {
  const db = database();
  db.exec(`INSERT INTO app_users(id,email) VALUES ('actor-1','Person@Example.Test'),('actor-2','other@example.test');
    INSERT INTO workspace_members(id,account_user_id,email,workspace_owner_user_id,status) VALUES
      ('legacy',NULL,'person@example.test','workspace-1','active'),
      ('linked','actor-1','unrelated@example.test','workspace-2','active'),
      ('revoked',NULL,'person@example.test','workspace-3','revoked'),
      ('someone-else','actor-2','person@example.test','workspace-4','active');`);
  const membership = db.prepare(ACTIVE_INVITE_MEMBER_SQL);
  assert.equal(membership.get("actor-1", "workspace-1").id, "legacy");
  assert.equal(membership.get("actor-1", "workspace-2").id, "linked");
  assert.equal(membership.get("actor-1", "workspace-3"), undefined);
  assert.equal(membership.get("actor-1", "workspace-4"), undefined);
  assert.equal(membership.get("actor-2", "workspace-1"), undefined);
  assert.equal(membership.get("unknown", "workspace-1"), undefined);
  db.close();
});
