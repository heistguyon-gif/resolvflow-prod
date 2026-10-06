import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { parseGlobalOtpBalance } from "../lib/otp-balance-result.ts";

const checkedAt = "2026-10-06T12:00:00.000Z";

test("saldo zero informado pelo fornecedor é válido; campo ausente não vira zero", () => {
  assert.deepEqual(parseGlobalOtpBalance(200, { balance: 0, currency: "USD" }, checkedAt),
    { state: "ready", balance: "0", currency: "USD", checkedAt });
  assert.deepEqual(parseGlobalOtpBalance(200, { currency: "USD" }, checkedAt),
    { state: "not_reported", checkedAt });
  assert.deepEqual(parseGlobalOtpBalance(200, { balance: "" }, checkedAt),
    { state: "not_reported", checkedAt });
});

test("falhas do fornecedor são estados separados dos settings", () => {
  assert.equal(parseGlobalOtpBalance(401, {}, checkedAt).state, "invalid_key");
  assert.equal(parseGlobalOtpBalance(402, {}, checkedAt).state, "insufficient_balance");
  assert.equal(parseGlobalOtpBalance(503, {}, checkedAt).state, "unavailable");
});

test("TOP remove envio do token PIX sem alterar o fallback de pagamento", () => {
  const screen = readFileSync(new URL("../app/components/AdminOtpCenter.tsx", import.meta.url), "utf8");
  const billing = readFileSync(new URL("../lib/otp-billing.ts", import.meta.url), "utf8");
  assert.doesNotMatch(screen, /pixToken|Token PIX legado/);
  assert.match(billing, /mercadoPagoCiphertext/);
  assert.match(billing, /getLegacyBravoPayApiKey/);
});
