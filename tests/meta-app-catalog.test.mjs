import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { filterAndSortMetaApps } from "../app/lib/metaAppCatalog.ts";

test("busca e filtro mantêm registros com App ID igual e ordenam pelo instante de criação", () => {
  const apps = [
    { id: "a", label: "Operação A", appId: "123456789", status: "active", createdAt: "2026-10-05 23:30:00" },
    { id: "b", label: "Operação B", appId: "123456789", status: "disabled", createdAt: "2026-10-06T01:00:00Z" },
    { id: "c", label: "Outro", appId: "987654321", status: "active", createdAt: "2026-10-06T02:00:00Z" },
  ];
  assert.deepEqual(filterAndSortMetaApps(apps, "123456789", "all").map((app) => app.id), ["b", "a"]);
  assert.deepEqual(filterAndSortMetaApps(apps, "operação", "active").map((app) => app.id), ["a"]);
  assert.deepEqual(filterAndSortMetaApps(apps, "", "disabled").map((app) => app.id), ["b"]);
  assert.deepEqual(apps.map((app) => app.id), ["a", "b", "c"]);
});

test("migração libera App ID repetido sem unir registros, credenciais ou atribuições", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE meta_apps (id text PRIMARY KEY, label text NOT NULL, app_id text NOT NULL,
      secret_ciphertext text NOT NULL, created_at text NOT NULL, status text NOT NULL);
      CREATE INDEX meta_apps_app_id_idx ON meta_apps(app_id);
      CREATE TABLE meta_app_assignments (id text PRIMARY KEY, meta_app_id text NOT NULL, account_user_id text NOT NULL);
      INSERT INTO meta_apps VALUES
        ('a','Primeiro','123456789','cipher-a','2026-10-01 09:00:00','active'),
        ('b','Segundo','123456789','cipher-b','2026-10-02T10:00:00Z','active'),
        ('c','Terceiro','333333333','cipher-c','2026-10-03 11:00:00','active'),
        ('d','Quarto','444444444','cipher-d','2026-10-04 12:00:00','active'),
        ('e','Quinto','555555555','cipher-e','2026-10-05 13:00:00','active');
      INSERT INTO meta_app_assignments VALUES ('grant-a','a','user-a'),('grant-b','b','user-b');
      CREATE TRIGGER meta_apps_app_id_no_new_duplicates BEFORE INSERT ON meta_apps
        WHEN EXISTS (SELECT 1 FROM meta_apps WHERE app_id = NEW.app_id)
        BEGIN SELECT RAISE(ABORT, 'meta_app_id_already_exists'); END;`);
    assert.throws(() => db.exec("INSERT INTO meta_apps VALUES ('f','Novo','123456789','cipher-f','2026-10-06 14:00:00','active')"), /meta_app_id_already_exists/);

    db.exec(await readFile(new URL("../drizzle/0042_meta_app_duplicate_ids.sql", import.meta.url), "utf8"));
    db.exec("INSERT INTO meta_apps VALUES ('f','Novo','123456789','cipher-f','2026-10-06 14:00:00','active')");
    assert.equal(db.prepare("SELECT count(*) AS total FROM meta_apps").get().total, 6);
    assert.deepEqual(db.prepare("SELECT id FROM meta_apps WHERE app_id='123456789' ORDER BY id").all().map((row) => row.id), ["a", "b", "f"]);
    db.exec("UPDATE meta_apps SET status='disabled' WHERE id='f'");
    assert.deepEqual(db.prepare("SELECT id, status, secret_ciphertext FROM meta_apps WHERE app_id='123456789' ORDER BY id").all().map((row) => ({ ...row })), [
      { id: "a", status: "active", secret_ciphertext: "cipher-a" },
      { id: "b", status: "active", secret_ciphertext: "cipher-b" },
      { id: "f", status: "disabled", secret_ciphertext: "cipher-f" },
    ]);
    assert.deepEqual(db.prepare("SELECT meta_app_id FROM meta_app_assignments ORDER BY id").all().map((row) => row.meta_app_id), ["a", "b"]);
    assert.deepEqual(db.prepare("SELECT id FROM meta_apps ORDER BY julianday(created_at) DESC, id DESC").all().map((row) => row.id), ["f", "e", "d", "c", "b", "a"]);
  } finally { db.close(); }
});
