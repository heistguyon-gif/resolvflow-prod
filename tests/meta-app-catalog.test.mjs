import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { filterAndSortMetaApps } from "../app/lib/metaAppCatalog.ts";

test("API ordena por rowid e mantém validação e bloqueio de novo App ID repetido", async () => {
  const [catalog, route] = await Promise.all([
    readFile(new URL("../lib/workspace-meta-apps.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/meta-apps/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(catalog, /createdSequence: sql<number>`\$\{metaApps\}\.rowid`/);
  assert.match(catalog, /orderBy\(desc\(sql`julianday\(\$\{metaApps\.createdAt\}\)`\), desc\(sql`\$\{metaApps\}\.rowid`\)\)/);
  assert.match(catalog, /if \(duplicate\) return null/);
  assert.match(route, /APP_ID_PATTERN\.test\(appId\).*appSecret\.length < 12/);
  assert.match(route, /if \(!id\) return Response\.json\(\{ error: "Este Meta App ID já está cadastrado/);
});

test("lista preserva App IDs repetidos e usa ordem de inserção quando o timestamp empata", () => {
  const apps = [
    { id: "uuid-z", label: "Operação A", appId: "123456789", status: "active", createdAt: "2026-10-06 12:00:00", createdSequence: 1 },
    { id: "uuid-a", label: "Operação B", appId: "123456789", status: "disabled", createdAt: "2026-10-06 12:00:00", createdSequence: 2 },
    { id: "uuid-c", label: "Outro", appId: "987654321", status: "active", createdAt: "2026-10-06T12:00:01Z", createdSequence: 3 },
  ];
  assert.deepEqual(filterAndSortMetaApps(apps, "123456789", "all").map((app) => app.id), ["uuid-a", "uuid-z"]);
  assert.deepEqual(filterAndSortMetaApps(apps, "operação", "active").map((app) => app.id), ["uuid-z"]);
  assert.deepEqual(filterAndSortMetaApps(apps, "", "disabled").map((app) => app.id), ["uuid-a"]);
  assert.deepEqual(apps.map((app) => app.id), ["uuid-z", "uuid-a", "uuid-c"]);
});

test("dois inserts com CURRENT_TIMESTAMP no mesmo segundo seguem ordem de rowid", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE apps (id text PRIMARY KEY, created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    db.exec("INSERT INTO apps (id) VALUES ('uuid-z'), ('uuid-a')");
    const rows = db.prepare("SELECT id, created_at AS createdAt, rowid AS createdSequence FROM apps ORDER BY julianday(created_at) DESC, rowid DESC").all();
    assert.equal(rows[0].createdAt, rows[1].createdAt);
    assert.deepEqual(rows.map((row) => row.id), ["uuid-a", "uuid-z"]);
    assert.deepEqual(filterAndSortMetaApps(rows.map((row) => ({ ...row, label: row.id, appId: "123456789", status: "active" })), "", "all").map((row) => row.id), ["uuid-a", "uuid-z"]);
  } finally { db.close(); }
});

test("cinco registros legados, inclusive App ID repetido, continuam separados; novos duplicados seguem bloqueados", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE meta_apps (id text PRIMARY KEY, label text NOT NULL, app_id text NOT NULL,
      secret_ciphertext text NOT NULL, created_at text NOT NULL, status text NOT NULL);
      CREATE INDEX meta_apps_app_id_idx ON meta_apps(app_id);
      CREATE TABLE meta_app_assignments (id text PRIMARY KEY, meta_app_id text NOT NULL, account_user_id text NOT NULL);
      INSERT INTO meta_apps VALUES
        ('uuid-z','Primeiro','123456789','cipher-a','2026-10-06 12:00:00','active'),
        ('uuid-a','Segundo','123456789','cipher-b','2026-10-06 12:00:00','active'),
        ('c','Terceiro','333333333','cipher-c','2026-10-03 11:00:00','active'),
        ('d','Quarto','444444444','cipher-d','2026-10-04 12:00:00','active'),
        ('e','Quinto','555555555','cipher-e','2026-10-05 13:00:00','active');
      INSERT INTO meta_app_assignments VALUES ('grant-a','uuid-z','user-a'),('grant-b','uuid-a','user-b');
      CREATE TRIGGER meta_apps_app_id_no_new_duplicates BEFORE INSERT ON meta_apps
        WHEN EXISTS (SELECT 1 FROM meta_apps WHERE app_id = NEW.app_id)
        BEGIN SELECT RAISE(ABORT, 'meta_app_id_already_exists'); END;`);
    assert.throws(() => db.exec("INSERT INTO meta_apps VALUES ('new','Novo','123456789','cipher-new','2026-10-07 14:00:00','active')"), /meta_app_id_already_exists/);
    assert.equal(db.prepare("SELECT count(*) AS total FROM meta_apps").get().total, 5);
    assert.deepEqual(db.prepare("SELECT id FROM meta_apps WHERE app_id='123456789' ORDER BY rowid DESC").all().map((row) => row.id), ["uuid-a", "uuid-z"]);
    assert.deepEqual(db.prepare("SELECT id FROM meta_apps ORDER BY julianday(created_at) DESC, rowid DESC").all().map((row) => row.id), ["uuid-a", "uuid-z", "e", "d", "c"]);
    db.exec("UPDATE meta_apps SET status='disabled' WHERE id='uuid-a'");
    assert.deepEqual(db.prepare("SELECT id, status, secret_ciphertext FROM meta_apps WHERE app_id='123456789' ORDER BY rowid").all().map((row) => ({ ...row })), [
      { id: "uuid-z", status: "active", secret_ciphertext: "cipher-a" },
      { id: "uuid-a", status: "disabled", secret_ciphertext: "cipher-b" },
    ]);
    assert.deepEqual(db.prepare("SELECT meta_app_id FROM meta_app_assignments ORDER BY id").all().map((row) => row.meta_app_id), ["uuid-z", "uuid-a"]);
  } finally { db.close(); }
});
