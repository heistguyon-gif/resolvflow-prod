import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { otpMetricsQueries, toOtpMetrics } from "../lib/admin-otp-metrics.ts";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE otp_payments (workspace_owner_user_id TEXT, actor_user_id TEXT, amount_cents INTEGER, status TEXT, paid_at TEXT);
    CREATE TABLE otp_ledger (workspace_owner_user_id TEXT, actor_user_id TEXT, amount_cents INTEGER, type TEXT, created_at TEXT);
    CREATE TABLE otp_inbox (workspace_owner_user_id TEXT, account_user_id TEXT, supplier_api_id TEXT, codes_json TEXT, closed INTEGER, created_at TEXT);
    CREATE TABLE otp_wallets (workspace_owner_user_id TEXT, balance_cents INTEGER);
    CREATE TABLE workspace_members (workspace_owner_user_id TEXT, account_user_id TEXT, status TEXT);
    INSERT INTO otp_payments VALUES
      ('w1','alice',1000,'paid','2026-10-02T10:00:00Z'),('w1','alice',900,'pending',NULL),
      ('w1','bob',2000,'paid','2026-10-02T11:00:00Z'),('w2','carol',3000,'paid','2026-10-03T10:00:00Z');
    INSERT INTO otp_ledger VALUES
      ('w1','alice',700,'debit_order','2026-10-02T10:00:00Z'),('w1','alice',200,'refund_order','2026-10-02T10:01:00Z'),
      ('w1','alice',1000,'credit_pix','2026-10-02T10:02:00Z'),('w1','alice',100,'debit_manual','2026-10-02T10:03:00Z'),
      ('w1','bob',1100,'debit_order','2026-10-02T11:00:00Z'),('w1','bob',100,'refund_order','2026-10-02T11:01:00Z');
    INSERT INTO otp_inbox VALUES
      ('w1','alice',NULL,'[{"code":"111111","at":"2026-10-02T10:04:00Z"},{"code":"old","at":"2026-09-01T10:00:00Z"}]',0,'2026-10-02T10:00:00Z'),
      ('w1','alice','own-api','[{"code":"222222","at":"2026-10-02T10:05:00Z"}]',1,'2026-10-02T10:01:00Z'),
      ('w1','bob',NULL,'[{"code":"333333","at":"2026-10-02T11:05:00Z"}]',0,'2026-10-02T11:00:00Z'),
      ('w2','carol','own-api','[{"code":"444444","at":"2026-10-03T11:00:00Z"}]',1,'2026-10-03T10:00:00Z');
    INSERT INTO otp_wallets VALUES ('w1',5000),('w2',3000);
    INSERT INTO workspace_members VALUES ('w1','alice','active'),('w1','bob','active'),('w2','carol','active');
  `);
  return db;
}

function metrics(db, scope) {
  const q = otpMetricsQueries(scope, true);
  const range = ["2026-10-01T00:00:00Z", "2026-10-31T23:59:59Z"];
  const actor = scope === "user" ? ["w1", "alice"] : [];
  const get = (query, args) => db.prepare(query).get(...args);
  const payments = get(q.payments, [...range, ...actor]);
  const consumption = get(q.consumption, [...range, ...actor]);
  const orders = get(q.orders, [...range, ...actor]);
  const codes = get(q.codes, [...range, ...actor]);
  const open = get(q.open, actor);
  const balance = get(q.balance, scope === "user" ? ["w1"] : []);
  const members = scope === "user" ? get(q.members, ["w1"]) : { total: 0 };
  return toOtpMetrics({ payments: payments.amount, consumption: consumption.amount, orders: orders.total,
    ownOrders: orders.own, globalOrLegacyOrders: orders.global_or_legacy, codes: codes.total, open: open.total,
    balance: balance.amount, activeMembers: members.total });
}

test("atribui PIX e consumo ao ator, pedidos e códigos ao comprador, e saldo ao workspace compartilhado", () => {
  const db = fixture();
  const alice = metrics(db, "user");
  assert.equal(alice.pixDepositsCents, 1000);
  assert.equal(alice.walletConsumptionCents, 500);
  assert.equal(alice.gmailCount, 2);
  assert.equal(alice.ownApiGmailCount, 1);
  assert.equal(alice.codesReceived, 2); // Código de setembro não entra no período.
  assert.equal(alice.openOrders, 1);
  assert.equal(alice.walletBalanceCents, 5000);
  assert.equal(alice.sharedWallet, true);
  const global = metrics(db, "global");
  assert.equal(global.pixDepositsCents, 6000);
  assert.equal(global.walletConsumptionCents, 1500); // Compra na API própria não cria débito na carteira.
  assert.equal(global.gmailCount, 4);
  assert.equal(global.ownApiGmailCount, 2);
  assert.equal(global.codesReceived, 4);
  assert.equal(global.openOrders, 2);
  assert.equal(global.walletBalanceCents, 8000); // w1 aparece uma vez, apesar dos dois usuários.
  const allTimeCodes = otpMetricsQueries("user", false).codes;
  assert.equal(db.prepare(allTimeCodes).get("w1", "alice").total, 3); // Inclui código antigo.
  db.prepare("INSERT INTO otp_inbox VALUES (?,?,?,?,?,?)").run("w1", "alice", null, "invalid", 1, "2026-09-01");
  db.prepare("INSERT INTO otp_inbox VALUES (?,?,?,?,?,?)").run("w1", "alice", null,
    JSON.stringify(["legacy", 123, { code: "sem-hora" }]), 1, "2026-09-01");
  assert.equal(db.prepare(allTimeCodes).get("w1", "alice").total, 4);
  db.close();
});

test("API de métricas exige admin e impede cache", () => {
  const source = readFileSync(new URL("../app/api/admin/otp/metrics/route.ts", import.meta.url), "utf8");
  assert.match(source, /requirePlatformAdmin\(request\)/);
  assert.match(source, /private, no-store/);
  assert.doesNotMatch(source, /supplierKey|codesJson/);
});
