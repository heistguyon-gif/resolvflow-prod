import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { loadPix } from "./helpers/pix-gateway-fixture.mjs";

// Loads the real route handler with only storage/billing/env stubbed.
function routeWith(env, calls = []) {
  const blackfy = loadPix("lib/blackfy.ts");
  const requestBody = loadPix("lib/request-body.ts");
  const db = { insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => { calls.push("insert"); return [{ eventId: "x" }]; } }) }) }) };
  return loadPix("app/api/otp/pix/blackfy/webhook/route.ts", {
    "../../../../../../db": { getDb: () => db },
    "../../../../../../db/schema": { otpPixWebhookEvents: { eventId: "event_id" } },
    "../../../../../../lib/otp-billing": { processBlackfyWebhookEvent: async (id) => { calls.push("process:" + id); return { reason: "credited" }; } },
    "../../../../../../lib/blackfy": blackfy,
    "../../../../../../lib/runtime-env": { runtimeEnv: () => env },
    "../../../../../../lib/request-body": requestBody,
  });
}
const secret = "whsec_route_fixture";
const body = JSON.stringify({ id: "evt_route_1", type: "charge.paid", data: { object: { id: "ch_route_1", status: "paid", amount: 500 } } });
const signed = (s = secret, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac("sha256", s).update(`${t}.${body}`).digest("hex")}`;
const post = (headers = {}) => new Request("https://resolvflow.online/api/otp/pix/blackfy/webhook", { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

test("GET stays a health response", async () => {
  const route = routeWith({});
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, provider: "blackfy" });
});

test("fails closed when BLACKFY_WEBHOOK_SECRET is missing or blank, even with a valid-looking signature", async () => {
  for (const env of [{ BLACKFY_API_KEY: "bk" }, { BLACKFY_API_KEY: "bk", BLACKFY_WEBHOOK_SECRET: "   " }, {}]) {
    const calls = [];
    const response = await routeWith(env, calls).POST(post({ "blackpay-signature": signed() }));
    assert.equal(response.status, 503);
    assert.deepEqual(calls, [], "nothing is stored or credited");
  }
});

test("fails closed when the API key is missing", async () => {
  const calls = [];
  const response = await routeWith({ BLACKFY_WEBHOOK_SECRET: secret }, calls).POST(post({ "blackpay-signature": signed() }));
  assert.equal(response.status, 503);
  assert.deepEqual(calls, []);
});

test("unsigned, wrong-secret and stale events are rejected with 401", async () => {
  const env = { BLACKFY_API_KEY: "bk", BLACKFY_WEBHOOK_SECRET: secret };
  for (const headers of [{}, { "blackpay-signature": signed("other") }, { "blackpay-signature": signed(secret, Math.floor(Date.now() / 1000) - 900) }]) {
    const calls = [];
    const response = await routeWith(env, calls).POST(post(headers));
    assert.equal(response.status, 401);
    assert.deepEqual(calls, []);
  }
});

test("correctly signed event is stored and processed", async () => {
  const calls = [];
  const response = await routeWith({ BLACKFY_API_KEY: "bk", BLACKFY_WEBHOOK_SECRET: secret }, calls).POST(post({ "blackpay-signature": signed() }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["insert", "process:blackfy:evt_route_1"]);
});
