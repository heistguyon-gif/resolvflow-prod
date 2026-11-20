import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { loadPix, bucket, codec, configModule } from "./helpers/pix-gateway-fixture.mjs";

const { verifyBlackfyWebhookSignature, blackfySignature, parseBlackfyWebhook, blackfyPaymentState, createBlackfyCharge, getBlackfyCharge, blackfyBaseUrl } = loadPix("lib/blackfy.ts");
const presentation = loadPix("app/components/pixGatewayPresentation.ts");

const secret = "whsec_test_123";
const body = JSON.stringify({ id: "evt_1", type: "charge.paid", livemode: false, data: { object: { id: "ch_abc", status: "paid", amount: 500 } } });
const t = 1794749583;
const ref = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");

test("signature matches node:crypto reference vector", async () => {
  assert.equal(await blackfySignature(secret, t, body), ref);
  assert.equal(await verifyBlackfyWebhookSignature({ rawBody: body, signatureHeader: `t=${t},v1=${ref}`, secret, nowSeconds: t + 10 }), true);
});
test("rejects tampered body, wrong secret, old/future timestamp, malformed header", async () => {
  assert.equal(await verifyBlackfyWebhookSignature({ rawBody: body + " ", signatureHeader: `t=${t},v1=${ref}`, secret, nowSeconds: t }), false);
  assert.equal(await verifyBlackfyWebhookSignature({ rawBody: body, signatureHeader: `t=${t},v1=${ref}`, secret: "x", nowSeconds: t }), false);
  assert.equal(await verifyBlackfyWebhookSignature({ rawBody: body, signatureHeader: `t=${t},v1=${ref}`, secret, nowSeconds: t + 301 }), false);
  assert.equal(await verifyBlackfyWebhookSignature({ rawBody: body, signatureHeader: `t=${t},v1=${ref}`, secret, nowSeconds: t - 301 }), false);
  assert.equal(await verifyBlackfyWebhookSignature({ rawBody: body, signatureHeader: `v1=${ref}`, secret, nowSeconds: t }), false);
  assert.equal(await verifyBlackfyWebhookSignature({ rawBody: body, signatureHeader: "", secret, nowSeconds: t }), false);
  assert.equal(await verifyBlackfyWebhookSignature({ rawBody: body, signatureHeader: `t=${t},v1=${ref}`, secret: "", nowSeconds: t }), false);
});
test("parse + state mapping", () => {
  assert.equal(parseBlackfyWebhook(body).data.object.id, "ch_abc");
  assert.throws(() => parseBlackfyWebhook(JSON.stringify({ type: "charge.paid" })));
  assert.deepEqual(["paid", "expired", "canceled", "refunded", "pending", "weird"].map(blackfyPaymentState), ["paid", "expired", "canceled", "refunded", "pending", "pending"]);
});
test("create sends idempotency + body; errors are friendly; ids are validated", async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return new Response(JSON.stringify({ id: "ch_1", status: "pending", amount: 500, external_id: "pix.x", pix: { copy_paste: "000201" } }), { status: 201 }); };
  const { payload } = await createBlackfyCharge({ apiKey: "bp_test_sk_fake", idempotencyKey: "pix.x", amountCents: 500, customer: { name: "A", email: "a@b.c", document: "52998224725" }, metadata: { payment_id: "x" }, callbackUrl: "https://resolvflow.online/api/otp/pix/blackfy/webhook", fetchImpl });
  assert.equal(payload.id, "ch_1");
  assert.equal(seen.url, "https://blackfy.blackfy.workers.dev/v1/pix/charges");
  assert.equal(seen.init.redirect, "manual");
  assert.equal(seen.init.headers["Idempotency-Key"], "pix.x");
  assert.equal(seen.init.headers.authorization, "Bearer bp_test_sk_fake");
  const sent = JSON.parse(seen.init.body);
  assert.equal(sent.external_id, "pix.x"); assert.equal(sent.amount, 500); assert.equal(sent.expires_in, 1800);
  const fail = async () => new Response(JSON.stringify({ error: { code: "invalid_api_key", message: "x" } }), { status: 401 });
  await assert.rejects(getBlackfyCharge("k", "ch_1", fail), /não está autorizada/);
  await assert.rejects(getBlackfyCharge("k", "../balance", fail), /inválida/);
});
test("BLACKFY_API_BASE: only absolute https without credentials/query; otherwise default", async () => {
  const d = "https://blackfy.blackfy.workers.dev/v1";
  assert.equal(blackfyBaseUrl(undefined), d);
  assert.equal(blackfyBaseUrl(""), d);
  assert.equal(blackfyBaseUrl("http://evil.test/v1"), d);
  assert.equal(blackfyBaseUrl("https://u:p@evil.test/v1"), d);
  assert.equal(blackfyBaseUrl("https://sandbox.test/v1?x=1"), d);
  assert.equal(blackfyBaseUrl("not a url"), d);
  assert.equal(blackfyBaseUrl("https://sandbox.test/v1/"), "https://sandbox.test/v1");
  let url;
  await getBlackfyCharge("k", "ch_1", async u => { url = u; return new Response(JSON.stringify({ id: "ch_1" })); }, "https://sandbox.test/v1");
  assert.equal(url, "https://sandbox.test/v1/pix/charges/ch_1");
});

const actor = "lucasbgn.affiliate@gmail.com";
async function registryWith(legacyRows) {
  const b = bucket(), c = await codec();
  const registry = configModule.createPixGatewayRegistry(b, c, async () => {}, async () => legacyRows, Date.now, async () => "bp_live_bravo_fixture");
  const command = async (action, fields = {}) => { const state = await registry.state(); return registry.command({ action, requestId: crypto.randomUUID(), expectedRevision: state.revision, ...fields }, actor); };
  return { registry, command };
}
const lezty = { provider: "leztypay", hasApiKey: true, hasWebhookSecret: true };
const bravo = { provider: "bravopay", hasApiKey: true, hasWebhookSecret: false };
const blackfy = (hasWebhookSecret = true) => ({ provider: "blackfy", hasApiKey: true, hasWebhookSecret });

test("default selection: BlackFy (key + webhook secret) > Lezty > BravoPay", async () => {
  assert.equal((await (await registryWith([lezty, bravo, blackfy()])).registry.active()).ref.configId, "legacy-blackfy");
  // Without its webhook secret BlackFy is never selected (its webhook is always signature-checked).
  assert.equal((await (await registryWith([lezty, bravo, blackfy(false)])).registry.active()).ref.configId, "legacy-leztypay");
  assert.equal((await (await registryWith([bravo, blackfy(false)])).registry.active()).ref.configId, "legacy-bravopay");
});
test("explicit admin selection wins and BlackFy can be selected/deselected in the gateways screen", async () => {
  const f = await registryWith([lezty, bravo, blackfy()]);
  await f.command("activate", { configId: "legacy-leztypay", version: 1 });
  assert.equal((await f.registry.active()).ref.configId, "legacy-leztypay");
  await f.command("activate", { configId: "legacy-blackfy", version: 1 });
  assert.equal((await f.registry.active()).ref.configId, "legacy-blackfy");
  const state = await f.registry.state();
  const row = state.gateways.find(g => g.id === "legacy-blackfy");
  assert.equal(row.label, "BlackFy existente");
  assert.equal(row.webhookUrl, "https://resolvflow.online/api/otp/pix/blackfy/webhook");
  assert.equal(row.active, true);
  // BravoPay legacy activation stays unsupported, as before.
  await assert.rejects(f.command("activate", { configId: "legacy-bravopay", version: 1 }), e => e.code === "config_not_found");
  // BlackFy cannot be created as a managed (R2) config: env secrets only.
  await assert.rejects(f.command("create", { label: "x", provider: "blackfy", apiKey: "bp_live_sk_fixture", webhookSecret: "whsec_fixture" }), e => e.code === "invalid_input");
});
test("activating BlackFy without webhook secret is refused", async () => {
  const f = await registryWith([lezty, blackfy(false)]);
  await assert.rejects(f.command("activate", { configId: "legacy-blackfy", version: 1 }), e => e.code === "legacy_incomplete");
});
test("checkout requires CPF/CNPJ for BlackFy", () => {
  assert.equal(configModule.pixCheckoutCapabilities({ legacy: true, ref: { configId: "legacy-blackfy", version: 1 } }, false).pixRequiresDocument, true);
  assert.equal(configModule.pixCheckoutCapabilities({ legacy: true, ref: { configId: "legacy-bravopay", version: 1 } }, false).pixRequiresDocument, false);
});
test("admin presentation accepts the BlackFy legacy row and only its fixed webhook URL", () => {
  assert.equal(presentation.publicWebhookUrl("https://resolvflow.online/api/otp/pix/blackfy/webhook"), "https://resolvflow.online/api/otp/pix/blackfy/webhook");
  assert.equal(presentation.publicWebhookUrl("https://resolvflow.online/api/otp/pix/blackfy/webhook?configId=x"), null);
  assert.equal(presentation.publicWebhookUrl("https://evil.test/api/otp/pix/blackfy/webhook"), null);
  const state = presentation.gatewayState({ revision: "1", active: { configId: "legacy-blackfy", version: 1 }, canManage: true, providers: [{ id: "leztypay", label: "Lezty Pay" }],
    gateways: [{ id: "legacy-blackfy", label: "BlackFy existente", provider: "blackfy", version: 1, origin: "legacy", status: "configured", active: true, activeVersion: 1, hasApiKey: true, hasWebhookSecret: true, verification: "not_checked", webhookUrl: "https://resolvflow.online/api/otp/pix/blackfy/webhook" }] });
  assert.equal(state.gateways[0].provider, "blackfy");
});
