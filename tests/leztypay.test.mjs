import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createLeztyPixTransaction,
  leztyPaymentState,
  verifyLeztyWebhookSignature,
} from "../lib/leztypay.ts";

test("criação PIX usa autenticação do servidor e chave de idempotência", async () => {
  let request;
  const fetchMock = async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify({
      id: "tx_test",
      object: "transaction",
      mode: "test",
      status: "pending",
      payment_method: "pix",
      amount: 1999,
      pix: { payload: "000201...", qr_base64: null, expires_at: "2026-10-01T12:00:00Z" },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  await createLeztyPixTransaction({
    apiKey: "server-secret",
    idempotencyKey: "pix.unique-attempt",
    amountCents: 1999,
    customer: { name: "Cliente", email: "cliente@example.com", document: "12345678901" },
    metadata: { payment_id: "payment-1" },
    postbackUrl: "https://resolvflow.online/api/otp/pix/webhook",
    fetchImpl: fetchMock,
  });

  assert.equal(request.url, "https://api.leztypay.com/v1/transactions");
  assert.equal(request.init.headers.authorization, "Bearer server-secret");
  assert.equal(request.init.headers["Idempotency-Key"], "pix.unique-attempt");
  const body = JSON.parse(request.init.body);
  assert.equal(body.amount, 1999);
  assert.equal(body.payment_method, "pix");
  assert.equal(body.postback_url, "https://resolvflow.online/api/otp/pix/webhook");
});

test("assinatura do webhook valida o corpo cru e rejeita alteração", async () => {
  const rawBody = JSON.stringify({ id: "evt_1", object: "event" });
  const secret = "webhook-secret";
  const timestamp = 1_800_000_000;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const signature = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const header = `t=${timestamp},v1=${signature}`;

  assert.equal(await verifyLeztyWebhookSignature({ rawBody, signatureHeader: header, secret, nowSeconds: timestamp }), true);
  assert.equal(await verifyLeztyWebhookSignature({ rawBody: `${rawBody} `, signatureHeader: header, secret, nowSeconds: timestamp }), false);
});

test("webhook persiste evento deduplicável e reconcilia fora da resposta", async () => {
  const [route, billing] = await Promise.all([
    readFile(new URL("../app/api/otp/pix/webhook/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/otp-billing.ts", import.meta.url), "utf8"),
  ]);

  assert.match(route, /const rawBody = await request\.text\(\)/);
  assert.match(route, /verifyLeztyWebhookSignature\(\{ rawBody/);
  assert.match(route, /onConflictDoNothing\(\)/);
  assert.match(route, /waitUntil\(processLeztyWebhookEvent/);
  assert.match(billing, /provider: "leztypay"/);
  assert.match(billing, /runtimeEnv\(\)\.LEZTYPAY_API_KEY/);
  assert.equal(leztyPaymentState("paid"), "paid");
  assert.equal(leztyPaymentState("chargeback"), "chargeback");
});
