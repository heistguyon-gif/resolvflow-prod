import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { ADMIN_CONNECTED_PROFILE_COUNT_SQL, ADMIN_CONNECTED_PROFILE_EXISTS_SQL, ADMIN_CONNECTED_PROFILE_GLOBAL_COUNT_SQL,
  ADMIN_PAGE_SIZE, adminPage, adminPeriod } from "../lib/admin-readonly.ts";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("período e paginação recusam limites inválidos", () => {
  assert.equal(ADMIN_PAGE_SIZE, 20);
  assert.equal(adminPage("-7"), 1);
  assert.equal(adminPage("999999"), 10000);
  assert.equal(adminPage("2"), 2);
  assert.equal(adminPeriod("invalid", "2026-10-04T00:00:00Z"), null);
  assert.equal(adminPeriod("2026-10-05T00:00:00Z", "2026-10-04T00:00:00Z"), null);
  assert.deepEqual(adminPeriod("2026-10-01T00:00:00Z", "2026-10-04T00:00:00Z"), {
    from: "2026-10-01T00:00:00.000Z", to: "2026-10-04T00:00:00.000Z",
  });
});

test("consulta de workspace autoriza admin e limita todas as tabelas pelo proprietário", async () => {
  const route = await source("app/api/admin/workspace/route.ts");
  assert.match(route, /await requirePlatformAdmin\(request\)/);
  assert.match(route, /where\(eq\(workspaces\.id, owner\)\)/);
  for (const table of ["accounts", "metaConnections", "campaigns", "scheduledPosts"]) {
    assert.match(route, new RegExp(`eq\\(${table}\\.ownerUserId, owner\\)`));
  }
  assert.match(route, /inArray\(scheduledPosts\.campaignId, rows\.map\(row => row\.id\)\)/);
  assert.match(route, /\.limit\(ADMIN_PAGE_SIZE\)\.offset\(\(page - 1\) \* ADMIN_PAGE_SIZE\)/g);
});

test("vínculo canônico ignora conexão antiga com mesmo @, arquivadas e IDs ausentes", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`create table accounts (id text, owner_user_id text, username text, instagram_account_id text, archived_at text);
      create table meta_connections (owner_user_id text, username text, instagram_user_id text, status text);
      insert into accounts values
        ('leo', 'w1', 'leo', 'id-new', null),
        ('ok', 'w1', 'ok', 'id-ok', null),
        ('ok-copy', 'w1', 'ok-copy', 'id-ok', null),
        ('archived', 'w1', 'archived', 'id-archived', '2026-10-01'),
        ('no-id', 'w1', 'legacy', null, null),
        ('other-tenant', 'w2', 'leo', 'id-new', null);
      insert into meta_connections values
        ('w1', 'leo', 'id-old', 'connected'),
        ('w1', 'leo', 'id-new', 'disconnected'),
        ('w1', 'ok', 'id-ok', 'connected'),
        ('w1', 'archived', 'id-archived', 'connected'),
        ('w1', 'legacy', 'id-legacy', 'connected'),
        ('w2', 'leo', 'id-new', 'connected');`);
    const rows = db.prepare(`select id, ${ADMIN_CONNECTED_PROFILE_EXISTS_SQL} as connected from accounts order by id`).all();
    assert.equal(rows.find(row => row.id === "leo").connected, 0);
    assert.equal(rows.find(row => row.id === "no-id").connected, 0);
    assert.equal(rows.find(row => row.id === "ok").connected, 1);
    assert.deepEqual(db.prepare(`select id from accounts where owner_user_id = 'w1' and archived_at is null and not ${ADMIN_CONNECTED_PROFILE_EXISTS_SQL} order by id`)
      .all().map(row => row.id), ["leo", "no-id"]);
    assert.equal(db.prepare(`select ${ADMIN_CONNECTED_PROFILE_COUNT_SQL} as connected from accounts where owner_user_id = 'w1'`).get().connected, 1);
    assert.equal(db.prepare(`select ${ADMIN_CONNECTED_PROFILE_GLOBAL_COUNT_SQL} as connected from accounts`).get().connected, 2);
    db.exec("update meta_connections set status = 'connected' where owner_user_id = 'w1' and instagram_user_id = 'id-new'");
    assert.equal(db.prepare(`select ${ADMIN_CONNECTED_PROFILE_COUNT_SQL} as connected from accounts where owner_user_id = 'w1'`).get().connected, 2);
  } finally { db.close(); }
});

test("projeção omite segredos e separa campanhas de templates", async () => {
  const route = await source("app/api/admin/workspace/route.ts");
  assert.match(route, /ADMIN_CONNECTED_PROFILE_COUNT_SQL/);
  assert.match(route, /ne\(campaigns\.status, "template"\)/);
  assert.match(route, /"completed", "cancelled"/);
  assert.doesNotMatch(route, /select\(\)|tokenCiphertext|tokenIv|passwordHash|loginPassword|emailPassword|secretCiphertext|recoveryEmail/);
  assert.match(route, /cache-control": "private, no-store"/);
});
