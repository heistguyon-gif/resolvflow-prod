import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { canUseLegacyMetaApp, chooseAssignedMetaApp } from "../lib/meta-app-selection.ts";
import { authorizeMetaOauthState } from "../lib/meta-oauth-authorization.ts";

test("migração D1 preserva ID e segredo cifrado e atribui App existente aos dois membros ativos", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE workspace_meta_apps (id text PRIMARY KEY, workspace_owner_user_id text, label text, app_id text,
    secret_ciphertext text, secret_iv text, graph_version text, redirect_uri text, status text, created_by_user_id text,
    created_at text, updated_at text);
    CREATE TABLE workspace_members (workspace_owner_user_id text, account_user_id text, email text, status text);
    CREATE TABLE app_users (id text PRIMARY KEY, email text);`);
  db.exec(`INSERT INTO app_users VALUES ('u1','one@preview.invalid'),('u2','two@preview.invalid');
    INSERT INTO workspace_members VALUES ('w1','u1','one@preview.invalid','active'),
      ('w1','u2','two@preview.invalid','active'),('w2','u1','one@preview.invalid','active');
    INSERT INTO workspace_meta_apps VALUES ('legacy-id','w1','App original','123456789','cipher-original',
      'iv-original','v26.0','https://preview.invalid/callback','active','u1','2026-01-01','2026-01-02');`);
  const migration = await readFile(new URL("../drizzle/0040_meta_app_assignments.sql", import.meta.url), "utf8");
  db.exec(migration);
  const canonical = db.prepare("SELECT id, app_id, secret_ciphertext, secret_iv FROM meta_apps WHERE id='legacy-id'").get();
  assert.deepEqual({ ...canonical }, { id: "legacy-id", app_id: "123456789", secret_ciphertext: "cipher-original", secret_iv: "iv-original" });
  const assignments = db.prepare("SELECT account_user_id,workspace_owner_user_id,status FROM meta_app_assignments ORDER BY account_user_id").all();
  assert.deepEqual(assignments.map((row) => [row.account_user_id, row.workspace_owner_user_id, row.status]),
    [["u1", "w1", "active"], ["u2", "w1", "active"]]);
  assert.equal(db.prepare("SELECT count(*) AS n FROM meta_app_user_policies").get().n, 2);
  db.exec("UPDATE meta_app_assignments SET status='revoked' WHERE account_user_id='u1'");
  assert.equal(db.prepare("SELECT count(*) AS n FROM meta_app_assignments WHERE account_user_id='u1' AND status='active'").get().n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM meta_app_assignments WHERE account_user_id='u2' AND status='active'").get().n, 1);
  assert.equal(db.prepare("SELECT secret_ciphertext FROM meta_apps WHERE id='legacy-id'").get().secret_ciphertext, "cipher-original");
  const currentApps = db.prepare("SELECT a.id, a.status FROM meta_app_assignments x JOIN meta_apps a ON a.id=x.meta_app_id WHERE x.account_user_id=? AND x.workspace_owner_user_id='w1' AND x.status='active'");
  assert.equal(chooseAssignedMetaApp(currentApps.all("u1"), "workspace:legacy-id"), null);
  assert.equal(chooseAssignedMetaApp(currentApps.all("u2"), "workspace:legacy-id")?.id, "legacy-id");
  db.close();
});

test("state OAuth novo registra o ator; state legado segue compatível", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE oauth_states (state text PRIMARY KEY, owner_user_id text NOT NULL)");
  db.exec("INSERT INTO oauth_states VALUES ('legacy','w1')");
  db.exec(await readFile(new URL("../drizzle/0041_meta_oauth_state_actor.sql", import.meta.url), "utf8"));
  db.exec("INSERT INTO oauth_states (state, owner_user_id, initiated_by_user_id) VALUES ('new','w1','u1')");
  assert.equal(db.prepare("SELECT initiated_by_user_id FROM oauth_states WHERE state='legacy'").get().initiated_by_user_id, null);
  assert.equal(db.prepare("SELECT initiated_by_user_id FROM oauth_states WHERE state='new'").get().initiated_by_user_id, "u1");
  db.close();
});

test("revogação durante OAuth bloqueia callback novo e state antigo de App gerenciado", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE workspace_meta_apps (id text PRIMARY KEY, workspace_owner_user_id text, label text, app_id text,
    secret_ciphertext text, secret_iv text, graph_version text, redirect_uri text, status text, created_by_user_id text,
    created_at text, updated_at text);
    CREATE TABLE workspace_members (workspace_owner_user_id text, account_user_id text, email text, status text);
    CREATE TABLE app_users (id text PRIMARY KEY, email text);
    CREATE TABLE oauth_states (state text PRIMARY KEY, owner_user_id text, meta_app_key text);`);
  db.exec(`INSERT INTO app_users VALUES ('u1','one@preview.invalid');
    INSERT INTO workspace_members VALUES ('w1','u1','one@preview.invalid','active');
    INSERT INTO workspace_meta_apps VALUES ('app-1','w1','App original','123456789','cipher','iv','v26.0',
      'https://preview.invalid/callback','active','u1','2026-01-01','2026-01-02');`);
  db.exec(await readFile(new URL("../drizzle/0040_meta_app_assignments.sql", import.meta.url), "utf8"));
  db.exec(await readFile(new URL("../drizzle/0041_meta_oauth_state_actor.sql", import.meta.url), "utf8"));
  db.exec(`INSERT INTO oauth_states (state,owner_user_id,meta_app_key,initiated_by_user_id)
    VALUES ('new','w1','workspace:app-1','u1'),('old','w1','workspace:app-1',NULL);`);
  const dependencies = {
    isWorkspaceManaged: async (owner) => Boolean(db.prepare("SELECT 1 FROM meta_app_user_policies WHERE workspace_owner_user_id=? LIMIT 1").get(owner)),
    resolveForActor: async (user, owner, key) => {
      const row = db.prepare(`SELECT a.id, a.status FROM meta_app_assignments x JOIN meta_apps a ON a.id=x.meta_app_id
        WHERE x.account_user_id=? AND x.workspace_owner_user_id=? AND x.status='active' AND a.id=?`).get(user, owner, key.slice(10));
      return row ? { key, configured: row.status === "active" } : null;
    },
    resolveStored: async (key) => {
      const row = db.prepare("SELECT status FROM meta_apps WHERE id=?").get(key.slice(10));
      return row ? { key, configured: row.status === "active" } : null;
    },
  };
  const stateQuery = db.prepare("SELECT owner_user_id AS ownerUserId, meta_app_key AS metaAppKey, initiated_by_user_id AS initiatedByUserId FROM oauth_states WHERE state=?");
  const newState = stateQuery.get("new");
  const oldState = stateQuery.get("old");
  assert.ok(await authorizeMetaOauthState(newState, dependencies));
  assert.equal(await authorizeMetaOauthState(oldState, dependencies), null);
  db.exec("UPDATE meta_app_assignments SET status='revoked' WHERE account_user_id='u1'");
  assert.equal(await authorizeMetaOauthState(newState, dependencies), null);
  assert.ok(await dependencies.resolveStored("workspace:app-1"));
  db.close();
});

test("seleção explícita bloqueia chave não atribuída e política impede fallback após revogação", () => {
  const apps = [{ id: "shared", status: "active" }, { id: "other", status: "active" }];
  assert.equal(chooseAssignedMetaApp(apps, "workspace:shared")?.id, "shared");
  assert.equal(chooseAssignedMetaApp(apps, "workspace:unassigned"), null);
  assert.equal(chooseAssignedMetaApp(apps, "default"), null);
  assert.equal(chooseAssignedMetaApp([], null), null);
  assert.equal(canUseLegacyMetaApp(true, false), false);
  assert.equal(canUseLegacyMetaApp(false, true), false);
  assert.equal(canUseLegacyMetaApp(false, false), true);
});

const base = process.env.ADMIN_QA_BASE_URL;
const request = async (path, init) => {
  const response = await fetch(new URL(path, base), init);
  const body = await response.json();
  return { status: response.status, body };
};

test("D1 local: atribuir a dois usuários, revogar um e preservar o outro sem expor secret", { skip: !base }, async () => {
  const appId = "qa-meta-shared";
  const settingsBefore = await request("/api/otp/settings");
  const directoryBefore = await request("/api/admin/users?q=aurora");
  const originalBalance = directoryBefore.body.users.find((row) => row.id === "qa-user-alpha")?.memberships.find((row) => row.workspaceOwnerUserId === "qa:alpha")?.walletBalanceCents;
  const assign = (accountUserId, workspaceOwnerUserId) => request("/api/admin/meta-apps", {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "assign", id: appId, accountUserId, workspaceOwnerUserId }),
  });
  const [alpha, beta] = await Promise.all([assign("qa-user-alpha", "qa:alpha"), assign("qa-user-beta", "qa:beta")]);
  assert.equal(alpha.status, 200);
  assert.equal(beta.status, 200);
  const catalog = await request("/api/admin/meta-apps");
  assert.equal(catalog.status, 200);
  const app = catalog.body.apps.find((row) => row.id === appId);
  assert.ok(app);
  assert.equal(app.assignments.length, 2);
  assert.equal(JSON.stringify(catalog.body).includes("secretCiphertext"), false);
  assert.equal(JSON.stringify(catalog.body).includes("fixture-encrypted-placeholder"), false);
  const revoke = await request("/api/admin/meta-apps", { method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "revoke", assignmentId: alpha.body.assignmentId }) });
  assert.equal(revoke.status, 200);
  const after = await request("/api/admin/meta-apps");
  const active = after.body.apps.find((row) => row.id === appId).assignments;
  assert.equal(active.some((row) => row.accountUserId === "qa-user-alpha"), false);
  assert.equal(active.some((row) => row.accountUserId === "qa-user-beta"), true);
  const invalidTarget = await assign("qa-user-beta", "qa:alpha");
  assert.equal(invalidTarget.status, 404);
  const directory = await request("/api/admin/users?q=aurora");
  assert.equal(directory.status, 200);
  const alphaWorkspace = directory.body.users.find((row) => row.id === "qa-user-alpha")?.memberships.find((row) => row.workspaceOwnerUserId === "qa:alpha");
  assert.equal(alphaWorkspace?.metaAccessMode, "catalog");
  assert.equal(alphaWorkspace?.metaApps.length, 0);
  assert.equal(alphaWorkspace?.walletBalanceCents, originalBalance);
  const settingsAfter = await request("/api/otp/settings");
  assert.deepEqual([settingsAfter.body.priceCents, settingsAfter.body.pricePriorityCents,
    settingsAfter.body.priceRushCents, settingsAfter.body.minDepositCents],
  [settingsBefore.body.priceCents, settingsBefore.body.pricePriorityCents,
    settingsBefore.body.priceRushCents, settingsBefore.body.minDepositCents]);
});

test("rotas admin de Apps e OTP exigem admin e não projetam secrets em listagens", async () => {
  for (const file of ["../app/api/admin/meta-apps/route.ts", "../app/api/admin/users/route.ts", "../app/api/admin/otp/route.ts"]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, /requirePlatformAdmin\(request\)/);
  }
});
