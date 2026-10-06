import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { summarizeOtpHistoryRow } from "../lib/admin-otp-history.ts";

test("histórico conta códigos sintéticos sem devolver seu conteúdo", () => {
  const row = { id: "inbox-1", codesJson: '[{"code":"123456","at":"2026-10-06"},{"code":"654321"}]', closed: 0, hiddenAt: null };
  const item = summarizeOtpHistoryRow(row);
  assert.equal(item.codeCount, 2);
  assert.equal(item.status, "open");
  assert.equal(JSON.stringify(item).includes("123456"), false);
  assert.equal("codesJson" in item, false);
  assert.equal(summarizeOtpHistoryRow({ ...row, closed: 1 }).status, "closed");
  assert.equal(summarizeOtpHistoryRow({ ...row, closed: 1, hiddenAt: "2026-10-06" }).status, "hidden");
  assert.equal(summarizeOtpHistoryRow({ ...row, codesJson: "invalid" }).codeCount, 0);
});

test("rota administrativa limita a consulta e exige admin sem cache", () => {
  const route = readFileSync(new URL("../app/api/admin/otp/history/route.ts", import.meta.url), "utf8");
  assert.match(route, /requirePlatformAdmin\(request\)/);
  assert.match(route, /PAGE_SIZE = 20/);
  assert.match(route, /\.limit\(PAGE_SIZE \+ 1\)\.offset/);
  assert.match(route, /private, no-store/);
  assert.doesNotMatch(route, /keyCiphertext|supplierKey/);
});
