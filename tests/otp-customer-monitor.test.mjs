import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { applyInboxVisibilityChange, maskCustomerInboxOrder } from "../lib/otp-inbox-record.ts";
import { fetchCodesByOrigin } from "../lib/otp-provider.ts";

function inboxDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE otp_inbox (
      id TEXT PRIMARY KEY, account_user_id TEXT NOT NULL, workspace_owner_user_id TEXT NOT NULL,
      supplier_api_id TEXT, order_id TEXT NOT NULL, email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', codes_json TEXT NOT NULL DEFAULT '[]',
      closed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO otp_inbox (id, account_user_id, workspace_owner_user_id, supplier_api_id, order_id, email) VALUES
      ('a1', 'alice', 'workspace-a', 'api-a', 'order-1', 'one@gmail.com'),
      ('a2', 'alice', 'workspace-a', 'api-b', 'order-2', 'two@gmail.com'),
      ('a3', 'alice', 'workspace-a', 'api-a', 'order-3', 'three@gmail.com'),
      ('b1', 'bob', 'workspace-b', 'api-b', 'order-4', 'other@gmail.com');
  `);
  db.exec(readFileSync(new URL("../drizzle/0038_otp_inbox_hidden.sql", import.meta.url), "utf8"));
  return db;
}

test("migration preserva todos os Gmails existentes abertos e visÃ­veis", () => {
  const db = inboxDb();
  const rows = db.prepare("SELECT closed, hidden_at FROM otp_inbox ORDER BY id").all();
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row) => row.closed === 0 && row.hidden_at === null));
});

test("resposta comum nÃ£o revela origem nem custo do fornecedor", () => {
  const order = maskCustomerInboxOrder({ inboxId: "inbox-1", email: "one@gmail.com", supplierApiId: "api-secret", supplierApiName: "API interna", price: "0.10" });
  assert.equal(order.inboxId, "inbox-1");
  assert.equal(order.supplierApiId, null);
  assert.equal(order.supplierApiName, "");
  assert.equal(order.price, "");
});

test("atualizaÃ§Ã£o em lote consulta trÃªs Gmails do usuÃ¡rio; busca individual consulta sÃ³ um", async () => {
  const db = inboxDb();
  const keys = new Map([["api-a", "mock-a"], ["api-b", "mock-b"]]);
  const calls = [];
  const lookup = async (rows) => fetchCodesByOrigin({
    orders: rows.map((row) => ({ order_id: row.order_id, supplierApiId: row.supplier_api_id })),
    concurrency: 3,
    resolveApiKey: async (apiId) => keys.get(apiId),
    fetchCode: async (key, orderId) => {
      calls.push({ key, orderId });
      const response = new Response(JSON.stringify({ status: "ready", code: `code-${orderId}` }), { status: 200 });
      return { response, data: { status: "ready", code: `code-${orderId}` } };
    },
  });
  const open = db.prepare("SELECT order_id, supplier_api_id FROM otp_inbox WHERE account_user_id = ? AND closed = 0 AND hidden_at IS NULL ORDER BY id").all("alice");
  assert.equal(open.length, 3);
  await lookup(open);
  assert.deepEqual(calls, [
    { key: "mock-a", orderId: "order-1" },
    { key: "mock-b", orderId: "order-2" },
    { key: "mock-a", orderId: "order-3" },
  ]);
  calls.length = 0;
  await lookup(open.filter((row) => row.order_id === "order-2"));
  assert.deepEqual(calls, [{ key: "mock-b", orderId: "order-2" }]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM otp_inbox WHERE account_user_id = 'bob' AND closed = 0").get().n, 1);
});

test("encerramento manual preserva pedido e impede ocultar Gmail aberto", async () => {
  const db = inboxDb();
  const row = db.prepare("SELECT closed FROM otp_inbox WHERE id = 'a1'").get();
  let updated = false;
  const rejected = await applyInboxVisibilityChange(row, true, async () => { updated = true; });
  assert.equal(rejected.state, "open");
  assert.equal(updated, false);
  db.prepare("UPDATE otp_inbox SET closed = 1, status = 'closed' WHERE account_user_id = ? AND id = ?").run("alice", "a1");
  const closed = db.prepare("SELECT * FROM otp_inbox WHERE id = 'a1'").get();
  assert.equal(closed.closed, 1);
  assert.equal(closed.email, "one@gmail.com");
  assert.equal(closed.hidden_at, null);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM otp_inbox WHERE account_user_id = 'alice' AND closed = 0").get().n, 2);
});

test("ocultaÃ§Ã£o e restauraÃ§Ã£o sÃ£o reversÃ­veis, isoladas por usuÃ¡rio e preservam histÃ³rico", async () => {
  const db = inboxDb();
  db.prepare("UPDATE otp_inbox SET closed = 1 WHERE id = 'a1'").run();
  const row = db.prepare("SELECT closed FROM otp_inbox WHERE id = 'a1' AND account_user_id = 'alice'").get();
  const change = (hidden) => applyInboxVisibilityChange(row, hidden, async () => {
    db.prepare("UPDATE otp_inbox SET hidden_at = ? WHERE id = ? AND account_user_id = ? AND closed = 1")
      .run(hidden ? "2026-10-04T12:00:00Z" : null, "a1", "alice");
  });
  assert.equal((await change(true)).state, "ok");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM otp_inbox WHERE account_user_id = 'alice' AND closed = 1 AND hidden_at IS NULL").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM otp_inbox WHERE account_user_id = 'alice' AND hidden_at IS NOT NULL").get().n, 1);
  assert.equal((await change(false)).state, "ok");
  assert.equal(db.prepare("SELECT email FROM otp_inbox WHERE id = 'a1'").get().email, "one@gmail.com");
  assert.equal(db.prepare("SELECT hidden_at FROM otp_inbox WHERE id = 'a1'").get().hidden_at, null);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM otp_inbox WHERE account_user_id = 'bob' AND hidden_at IS NULL").get().n, 1);
});

test("fluxo de carteira mantÃ©m preÃ§o por unidade e estorno somente das unidades nÃ£o entregues", () => {
  const unitCents = 250;
  const requested = 3;
  const delivered = 2;
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE wallet (owner TEXT PRIMARY KEY, balance_cents INTEGER NOT NULL); INSERT INTO wallet VALUES ('alice', 2000)");
  db.prepare("UPDATE wallet SET balance_cents = balance_cents - ? WHERE owner = ?").run(unitCents * requested, "alice");
  db.prepare("UPDATE wallet SET balance_cents = balance_cents + ? WHERE owner = ?").run(unitCents * (requested - delivered), "alice");
  assert.equal(db.prepare("SELECT balance_cents FROM wallet WHERE owner = 'alice'").get().balance_cents, 2000 - unitCents * delivered);
  const route = readFileSync(new URL("../app/api/otp/route.ts", import.meta.url), "utf8");
  assert.match(route, /debitWallet\(\{ workspaceOwnerUserId: ctx\.workspaceOwnerUserId/);
  assert.match(route, /refundWallet\(\{ workspaceOwnerUserId: ctx\.workspaceOwnerUserId/);
  assert.match(route, /const unused = quantity - orders\.length/);
});
