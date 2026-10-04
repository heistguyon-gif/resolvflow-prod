import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { normalizeDashboardPreferences } from "../lib/dashboard-preferences.ts";

test("personalização elimina IDs inválidos e mantém uma métrica em apenas uma faixa", () => {
  const result = normalizeDashboardPreferences({
    widgets: ["accounts", "metrics", "invalid", "accounts"],
    hidden: ["health", "invalid"],
    cards: ["views", "queue", "views", "invalid"],
    strip: ["views", "reach", "invalid"],
  });
  assert.deepEqual(result.widgets, ["accounts", "metrics"]);
  assert.deepEqual(result.hidden, ["health"]);
  assert.deepEqual(result.cards, ["views", "queue"]);
  assert.equal(result.strip.includes("views"), false);
  assert.deepEqual(new Set([...result.cards, ...result.strip]).size, 8);
});

test("arquivamento preserva histórico, pausa fila e não apaga registros", async () => {
  const route = await readFile(new URL("../app/api/accounts/route.ts", import.meta.url), "utf8");
  assert.match(route, /action === "archive"/);
  assert.match(route, /status: "paused"/);
  assert.match(route, /status: "archived"/);
  assert.match(route, /isNull\(accounts\.archivedAt\)/);
  const archiveBranch = route.slice(route.indexOf('payload.action === "archive"'), route.indexOf("const includesRecoveryData"));
  assert.doesNotMatch(archiveBranch, /delete\(/);
});

test("conta arquivada não entra em agendamento ou processamento", async () => {
  const [schedule, queue] = await Promise.all([
    readFile(new URL("../app/api/campaigns/[id]/schedule/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/queue-engine.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schedule, /isNull\(accounts\.archivedAt\)/);
  assert.match(schedule, /contas selecionadas estão arquivadas/);
  assert.match(queue, /if \(account\.archivedAt\)/);
  assert.match(queue, /publicação preservada e pausada/);
});

test("reconexão recupera a conta pelo ID da Meta e desarquiva o mesmo registro", async () => {
  const lifecycle = await readFile(new URL("../lib/account-lifecycle.ts", import.meta.url), "utf8");
  assert.match(lifecycle, /accounts\.instagramAccountId/);
  assert.match(lifecycle, /sameInstagramAccount\.id/);
  assert.match(lifecycle, /archivedAt: null/);
});

test("dashboard usa rota D1 por workspace e não depende apenas do localStorage", async () => {
  const [route, bridge, schema] = await Promise.all([
    readFile(new URL("../app/api/dashboard-preferences/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/DashboardPreferencesPersistence.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /dashboard_preferences/);
  assert.match(route, /workspaceOwnerUserId/);
  assert.match(route, /onConflictDoUpdate/);
  assert.match(bridge, /fetch\("\/api\/dashboard-preferences"/);
  assert.match(bridge, /method: "PUT"/);
});

test("migration de arquivamento e preferencias executa isoladamente", async () => {
  const migration = await readFile(new URL("../drizzle/0033_account_archive_dashboard_preferences.sql", import.meta.url), "utf8");
  const database = new DatabaseSync(":memory:");
  database.exec("CREATE TABLE accounts (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL)");
  database.exec(migration.replaceAll("--> statement-breakpoint", ""));
  const accountColumns = database.prepare("PRAGMA table_info(accounts)").all();
  const preferenceTables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'dashboard_preferences'").all();
  assert.equal(accountColumns.some((column) => column.name === "archived_at"), true);
  assert.equal(preferenceTables.length, 1);
  assert.equal(preferenceTables[0].name, "dashboard_preferences");
  database.close();
});
