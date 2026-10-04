import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { backfillLegacyInboxOrigin, buildInboxInsertRecord } from "../lib/otp-inbox-record.ts";
import { fetchCodesByOrigin, mapWithConcurrency, requestOrdersForApi } from "../lib/otp-provider.ts";

function providerResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("pedidos em APIs distintas usam suas próprias chaves e isolam falha parcial", async () => {
  const seenKeys = [];
  const saved = [];
  const fetchMock = async (_url, init) => {
    const key = init.headers["X-API-Key"];
    seenKeys.push(key);
    if (key === "key-a") return providerResponse(200, { order_id: "order-a", email: "a@gmail.com", status: "active" });
    return providerResponse(409, { error: { code: "out_of_stock", message: "out of stock" } });
  };

  const apis = [
    { id: "api-a", key: "key-a" },
    { id: "api-b", key: "key-b" },
  ];
  const results = await mapWithConcurrency(apis, 2, async (api) => {
    const result = await requestOrdersForApi({
      apiKey: api.key,
      product: "ig_gmail_otp",
      priorityMode: 0,
      quantity: 1,
      fetchImpl: fetchMock,
      wait: async () => undefined,
      onOrder: async (record) => saved.push({ apiId: api.id, orderId: record.order_id }),
    });
    return { apiId: api.id, ...result };
  });

  assert.deepEqual(new Set(seenKeys), new Set(["key-a", "key-b"]));
  assert.deepEqual(saved, [{ apiId: "api-a", orderId: "order-a" }]);
  assert.equal(results[0].orders.length, 1);
  assert.equal(results[1].orders.length, 0);
  assert.equal(results[1].lastFailure.status, 409);
});

test("lotes concorrentes preservam a ordem dos resultados", async () => {
  const completed = [];
  const results = await mapWithConcurrency(["a", "b", "c"], 2, async (value) => {
    if (value === "a") await new Promise((resolve) => setTimeout(resolve, 8));
    completed.push(value);
    return value.toUpperCase();
  });
  assert.notDeepEqual(completed, ["a", "b", "c"]);
  assert.deepEqual(results, ["A", "B", "C"]);
});

function migratedInboxDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE otp_inbox (
      id TEXT PRIMARY KEY NOT NULL,
      account_user_id TEXT NOT NULL,
      workspace_owner_user_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      email TEXT NOT NULL,
      product TEXT DEFAULT 'ig_gmail_otp' NOT NULL,
      status TEXT DEFAULT 'active' NOT NULL,
      price TEXT DEFAULT '' NOT NULL,
      codes_json TEXT DEFAULT '[]' NOT NULL,
      closed INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE UNIQUE INDEX otp_inbox_account_order_uq ON otp_inbox (account_user_id, order_id);
    CREATE TABLE otp_inbox_state (
      account_user_id TEXT PRIMARY KEY NOT NULL,
      active_order_id TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);
  const migration = readFileSync(new URL("../drizzle/0031_multi_otp_supplier_apis.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint").map((item) => item.trim()).filter(Boolean)) db.exec(statement);
  return db;
}

test("registro de inbox persiste a API que originou o pedido", () => {
  const db = migratedInboxDatabase();
  db.prepare("INSERT INTO otp_supplier_apis (id, workspace_owner_user_id, name, key_ciphertext, key_iv, enabled, is_primary) VALUES (?, ?, ?, ?, ?, 1, 0)")
    .run("api-a", "workspace-1", "API A", "cipher", "iv");
  const record = buildInboxInsertRecord({
    accountUserId: "user-1",
    workspaceOwnerUserId: "workspace-1",
    supplierApiId: "api-a",
    orderId: "order-a",
    email: "a@gmail.com",
    product: "ig_gmail_otp",
  }, "inbox-a", "2026-09-26T12:00:00.000Z");
  db.prepare(`INSERT INTO otp_inbox
    (id, account_user_id, workspace_owner_user_id, supplier_api_id, order_id, email, product, status, price, codes_json, closed, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(record.id, record.accountUserId, record.workspaceOwnerUserId, record.supplierApiId, record.orderId, record.email, record.product, record.status, record.price, record.codesJson, record.closed, record.createdAt, record.updatedAt);
  const saved = db.prepare("SELECT supplier_api_id FROM otp_inbox WHERE id = ?").get("inbox-a");
  assert.equal(saved.supplier_api_id, "api-a");
});

test("consulta em lote usa a chave da API associada a cada pedido", async () => {
  const calls = [];
  const keys = new Map([["api-a", "key-a"], ["api-b", "key-b"]]);
  const results = await fetchCodesByOrigin({
    orders: [
      { order_id: "order-a", supplierApiId: "api-a" },
      { order_id: "order-b", supplierApiId: "api-b" },
    ],
    concurrency: 2,
    resolveApiKey: async (supplierApiId) => keys.get(supplierApiId) || null,
    fetchCode: async (apiKey, orderId) => {
      calls.push({ apiKey, orderId });
      return { response: providerResponse(200, { status: "ready", code: `${apiKey}-code` }), data: { status: "ready", code: `${apiKey}-code` } };
    },
  });
  assert.deepEqual(calls, [
    { apiKey: "key-a", orderId: "order-a" },
    { apiKey: "key-b", orderId: "order-b" },
  ]);
  assert.equal(results[0].order.supplierApiId, "api-a");
  assert.equal(results[1].order.supplierApiId, "api-b");
});

test("API principal materializada vincula pedidos históricos sem origem", async () => {
  const db = migratedInboxDatabase();
  db.exec(`
    INSERT INTO otp_inbox (id, account_user_id, workspace_owner_user_id, order_id, email) VALUES
      ('legacy-1', 'user-1', 'workspace-1', 'old-order-1', 'old1@gmail.com'),
      ('legacy-other', 'user-2', 'workspace-2', 'old-order-2', 'old2@gmail.com');
    INSERT INTO otp_supplier_apis (id, workspace_owner_user_id, name, key_ciphertext, key_iv, enabled, is_primary)
      VALUES ('primary-1', 'workspace-1', 'API principal', 'cipher', 'iv', 1, 1);
  `);
  await backfillLegacyInboxOrigin("workspace-1", "primary-1", async ({ workspaceOwnerUserId, supplierApiId }) => {
    db.prepare("UPDATE otp_inbox SET supplier_api_id = ? WHERE workspace_owner_user_id = ? AND supplier_api_id IS NULL")
      .run(supplierApiId, workspaceOwnerUserId);
  });
  const own = db.prepare("SELECT supplier_api_id FROM otp_inbox WHERE id = 'legacy-1'").get();
  const other = db.prepare("SELECT supplier_api_id FROM otp_inbox WHERE id = 'legacy-other'").get();
  assert.equal(own.supplier_api_id, "primary-1");
  assert.equal(other.supplier_api_id, null);
});

test("exclusão lógica remove a chave e preserva o vínculo do histórico", () => {
  const db = migratedInboxDatabase();
  const migration = readFileSync(new URL("../drizzle/0034_otp_supplier_api_soft_delete.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint").map((item) => item.trim()).filter(Boolean)) db.exec(statement);
  db.exec(`
    INSERT INTO otp_supplier_apis (id, workspace_owner_user_id, name, key_ciphertext, key_iv, enabled, is_primary)
      VALUES ('api-delete', 'workspace-1', 'API descartável', 'cipher', 'iv', 1, 0);
    INSERT INTO otp_inbox (id, account_user_id, workspace_owner_user_id, supplier_api_id, order_id, email, closed)
      VALUES ('closed-order', 'user-1', 'workspace-1', 'api-delete', 'order-1', 'old@gmail.com', 1);
    UPDATE otp_supplier_apis SET enabled = 0, key_ciphertext = '', key_iv = '', deleted_at = CURRENT_TIMESTAMP WHERE id = 'api-delete';
  `);
  const api = db.prepare("SELECT key_ciphertext, key_iv, deleted_at FROM otp_supplier_apis WHERE id = 'api-delete'").get();
  const order = db.prepare("SELECT supplier_api_id FROM otp_inbox WHERE id = 'closed-order'").get();
  assert.equal(api.key_ciphertext, "");
  assert.equal(api.key_iv, "");
  assert.ok(api.deleted_at);
  assert.equal(order.supplier_api_id, "api-delete");
});

test("exclusão forçada encerra pedidos abertos antes de remover a chave", () => {
  const db = migratedInboxDatabase();
  const migration = readFileSync(new URL("../drizzle/0034_otp_supplier_api_soft_delete.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint").map((item) => item.trim()).filter(Boolean)) db.exec(statement);
  db.exec(`
    INSERT INTO otp_supplier_apis (id, workspace_owner_user_id, name, key_ciphertext, key_iv, enabled, is_primary)
      VALUES ('api-force', 'workspace-1', 'API com pedido', 'cipher', 'iv', 1, 0);
    INSERT INTO otp_inbox (id, account_user_id, workspace_owner_user_id, supplier_api_id, order_id, email, closed)
      VALUES ('open-order', 'user-1', 'workspace-1', 'api-force', 'order-open', 'open@gmail.com', 0);
    UPDATE otp_inbox SET closed = 1, status = 'closed' WHERE workspace_owner_user_id = 'workspace-1' AND supplier_api_id = 'api-force' AND closed = 0;
    UPDATE otp_supplier_apis SET enabled = 0, key_ciphertext = '', key_iv = '', deleted_at = CURRENT_TIMESTAMP WHERE id = 'api-force';
  `);
  const api = db.prepare("SELECT key_ciphertext, deleted_at FROM otp_supplier_apis WHERE id = 'api-force'").get();
  const order = db.prepare("SELECT closed, status, supplier_api_id FROM otp_inbox WHERE id = 'open-order'").get();
  assert.equal(order.closed, 1);
  assert.equal(order.status, "closed");
  assert.equal(order.supplier_api_id, "api-force");
  assert.equal(api.key_ciphertext, "");
  assert.ok(api.deleted_at);
});
