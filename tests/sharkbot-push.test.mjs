import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  dispatchPushBatch,
  isSharkBotPushEvent,
  safeSalePushPayload,
  selectAdminPushSubscriptions,
  sharkBotEventPushPayload,
  simulatedStartAmountCents,
  simulatedStartPushPayload,
  subscriptionWantsSharkBotEvent,
} from "../lib/sharkbot-push-policy.ts";
import { matchingSharkBotSecretIndex, resolveSharkBotTarget, verifySharkBotSignature, verifySharkBotSignatureWithSecrets } from "../lib/sharkbot.ts";
import { isValidVapidConfig, sendWebPush } from "../lib/web-push.ts";

function webPushKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const publicJwk = publicKey.export({ format: "jwk" });
  const privateJwk = privateKey.export({ format: "jwk" });
  assert.ok(publicJwk.x && publicJwk.y && privateJwk.d);
  return {
    publicKey: Buffer.concat([Buffer.from([4]), Buffer.from(publicJwk.x, "base64url"), Buffer.from(publicJwk.y, "base64url")]).toString("base64url"),
    privateKey: privateJwk.d,
  };
}

test("0032, 0033 e 0035 executam em ordem em um D1 SQLite isolado", async () => {
  const [pushMigration, accountMigration, preferenceMigration] = await Promise.all([
    readFile(new URL("../drizzle/0032_sharkbot_push.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0033_account_archive_dashboard_preferences.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0035_sharkbot_push_preferences.sql", import.meta.url), "utf8"),
  ]);
  const database = new DatabaseSync(":memory:");
  database.exec("CREATE TABLE accounts (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL)");
  database.exec(pushMigration.replaceAll("--> statement-breakpoint", ""));
  database.exec(accountMigration.replaceAll("--> statement-breakpoint", ""));
  database.exec(preferenceMigration.replaceAll("--> statement-breakpoint", ""));
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name);
  assert.ok(tables.includes("push_subscriptions"));
  assert.ok(tables.includes("sharkbot_push_deliveries"));
  assert.ok(tables.includes("dashboard_preferences"));
  assert.equal(database.prepare("PRAGMA table_info(accounts)").all().some((column) => column.name === "archived_at"), true);
  const pushColumns = database.prepare("PRAGMA table_info(push_subscriptions)").all();
  assert.equal(pushColumns.some((column) => column.name === "notify_new_lead"), true);
  assert.equal(pushColumns.some((column) => column.name === "notify_payment_created"), true);
  assert.equal(pushColumns.some((column) => column.name === "notify_payment_approved"), true);
  database.exec("INSERT INTO sharkbot_push_deliveries (id,event_id,subscription_id) VALUES ('one','event','subscription')");
  assert.throws(() => database.exec("INSERT INTO sharkbot_push_deliveries (id,event_id,subscription_id) VALUES ('two','event','subscription')"), /UNIQUE/);
  database.close();
});

test("os três eventos configuráveis podem disparar push e nenhum payload expõe comprador", () => {
  assert.equal(isSharkBotPushEvent("payment_approved"), true);
  assert.equal(isSharkBotPushEvent("payment_created"), true);
  assert.equal(isSharkBotPushEvent("new_lead"), true);
  assert.equal(isSharkBotPushEvent("unknown"), false);
  const first = safeSalePushPayload({ eventId: "event-a", amountCents: 12990, currency: "BRL", productName: "Produto teste" });
  const second = safeSalePushPayload({ eventId: "event-b", amountCents: 12990, currency: "BRL", productName: "Produto teste" });
  assert.equal(first.web_push, 8030);
  assert.equal(first.notification.title, "Nova Venda!");
  assert.match(first.notification.body, /129,90/);
  assert.doesNotMatch(first.notification.body, /Produto teste/);
  assert.match(first.notification.navigate, /^https:\/\/resolvflow\.online\//);
  assert.notEqual(first.notification.tag, second.notification.tag);
  assert.doesNotMatch(JSON.stringify(first), /payer|comprador|cliente/i);
  const lead = sharkBotEventPushPayload({ eventId: "lead-a", eventType: "new_lead", amountCents: 0, currency: "BRL" });
  const pending = sharkBotEventPushPayload({ eventId: "pending-a", eventType: "payment_created", amountCents: 1999, currency: "BRL" });
  assert.equal(lead.notification.title, "Novo lead no bot");
  assert.equal(pending.notification.title, "Novo pedido pendente");
  assert.match(pending.notification.body, /19,99/);
  assert.doesNotMatch(JSON.stringify({ lead, pending }), /payer|comprador|cliente/i);
});

test("preferências filtram cada tipo por dispositivo e preservam os padrões existentes", () => {
  const defaults = { id: "default", ownerUserId: "owner", accountUserId: "admin" };
  assert.equal(subscriptionWantsSharkBotEvent(defaults, "new_lead"), true);
  assert.equal(subscriptionWantsSharkBotEvent(defaults, "payment_created"), false);
  assert.equal(subscriptionWantsSharkBotEvent(defaults, "payment_approved"), true);
  const custom = { ...defaults, notifyNewLead: false, notifyPaymentCreated: true, notifyPaymentApproved: false };
  assert.equal(subscriptionWantsSharkBotEvent(custom, "new_lead"), false);
  assert.equal(subscriptionWantsSharkBotEvent(custom, "payment_created"), true);
  assert.equal(subscriptionWantsSharkBotEvent(custom, "payment_approved"), false);
});

test("modo de simulação transforma start em push sem contaminar uma venda real", () => {
  const amount = simulatedStartAmountCents("lead:exemplo");
  assert.ok(amount >= 999 && amount <= 3999);
  assert.equal(simulatedStartAmountCents("lead:exemplo"), amount);
  const payload = simulatedStartPushPayload({ eventId: "start-a", amountCents: amount });
  assert.equal(payload.web_push, 8030);
  assert.equal(payload.notification.title, "Nova Venda!");
  assert.match(payload.notification.body, /^Você recebeu R\$\s*[0-9]/);
  assert.doesNotMatch(payload.notification.body, /bot|fluxo|produto/i);
  assert.match(payload.notification.tag, /start-a/);
});

test("seleção de subscriptions fica exclusiva ao admin e ignora desativadas", () => {
  const subscriptions = [
    { id: "ok", ownerUserId: "owner", accountUserId: "admin", disabledAt: null },
    { id: "member", ownerUserId: "owner", accountUserId: "member", disabledAt: null },
    { id: "other", ownerUserId: "other", accountUserId: "admin", disabledAt: null },
    { id: "disabled", ownerUserId: "owner", accountUserId: "admin", disabledAt: "2026-09-29" },
  ];
  assert.deepEqual(selectAdminPushSubscriptions(subscriptions, "owner", "admin").map((row) => row.id), ["ok"]);
});

test("lote deduplica, entrega em paralelo, remove expirada e isola falhas", async () => {
  const subscriptions = ["delivered", "expired", "provider-failure", "network-failure", "duplicate"].map((id) => ({ id, ownerUserId: "owner", accountUserId: "admin" }));
  const callbacks = { delivered: [], expired: [], failed: [], sent: [] };
  const result = await dispatchPushBatch({
    subscriptions,
    eventId: "event",
    claim: async (_eventId, subscription) => subscription.id !== "duplicate",
    send: async (subscription) => {
      callbacks.sent.push(subscription.id);
      if (subscription.id === "expired") return { ok: false, status: 410 };
      if (subscription.id === "provider-failure") return { ok: false, status: 503 };
      if (subscription.id === "network-failure") throw new Error("offline");
      return { ok: true, status: 201 };
    },
    delivered: async (subscription) => { callbacks.delivered.push(subscription.id); },
    expired: async (subscription) => { callbacks.expired.push(subscription.id); },
    failed: async (subscription) => { callbacks.failed.push(subscription.id); },
  });
  assert.deepEqual(result, { delivered: 1, expired: 1, failed: 2, duplicate: 1 });
  assert.deepEqual(callbacks.delivered, ["delivered"]);
  assert.deepEqual(callbacks.expired, ["expired"]);
  assert.deepEqual(callbacks.failed.sort(), ["network-failure", "provider-failure"]);
  assert.equal(callbacks.sent.includes("duplicate"), false);
});

test("VAPID é validado e a requisição Web Push não expõe a chave privada", async () => {
  const vapidKeys = webPushKeys();
  const receiverKeys = webPushKeys();
  const config = { ...vapidKeys, subject: "mailto:admin@resolvflow.online" };
  assert.equal(isValidVapidConfig(config), true);
  assert.equal(isValidVapidConfig({ ...config, subject: "admin@resolvflow.online" }), false);
  let captured;
  const response = await sendWebPush({
    endpoint: "https://push.example.test/message/one",
    p256dh: receiverKeys.publicKey,
    auth: randomBytes(16).toString("base64url"),
  }, { title: "Teste" }, config, async (url, init) => {
    captured = { url, init };
    return new Response(null, { status: 201 });
  });
  assert.equal(response.status, 201);
  assert.equal(captured.url, "https://push.example.test/message/one");
  assert.match(String(captured.init.headers.authorization), /^vapid t=/);
  assert.equal(String(captured.init.headers.authorization).includes(config.privateKey), false);
  assert.ok(captured.init.body instanceof Uint8Array);
  assert.ok(captured.init.body.byteLength > 86);
});

test("HMAC e roteamento exigem o administrador configurado", async () => {
  const body = JSON.stringify({ event: "payment_approved" });
  const secret = "segredo-de-teste";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("hex");
  assert.equal(await verifySharkBotSignature(body, signature, secret), true);
  assert.equal(await verifySharkBotSignature(`${body}x`, signature, secret), false);
  assert.equal(await verifySharkBotSignatureWithSecrets(body, signature, ["outro-segredo", secret]), true);
  assert.equal(await verifySharkBotSignatureWithSecrets(body, signature, ["outro-segredo", null]), false);
  assert.equal(await matchingSharkBotSecretIndex(body, signature, ["outro-segredo", secret]), 1);
  assert.equal(await matchingSharkBotSecretIndex(body, signature, [secret, "outro-segredo"]), 0);
  const target = await resolveSharkBotTarget({
    configuredOwnerEmail: "lucasbgn.affiliate@gmail.com",
    configuredWorkspaceOwnerId: "owner",
    targetEmail: "lucasbgn.affiliate@gmail.com",
    findTarget: async () => ({ ownerUserId: "owner", accountUserId: "admin" }),
  });
  assert.deepEqual(target, { ownerUserId: "owner", accountUserId: "admin" });
  await assert.rejects(() => resolveSharkBotTarget({
    configuredOwnerEmail: "outra@conta.com",
    configuredWorkspaceOwnerId: "owner",
    targetEmail: "lucasbgn.affiliate@gmail.com",
    findTarget: async () => ({ ownerUserId: "owner", accountUserId: "admin" }),
  }));
});

test("webhook responde antes do push e endpoints administrativos permanecem protegidos", async () => {
  const [webhook, pushRoute, serviceWorker, component] = await Promise.all([
    readFile(new URL("../app/api/integrations/sharkbot/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/integrations/sharkbot/push/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/components/SharkBotIntegration.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(webhook, /deliverSharkBotEventPush/);
  assert.match(webhook, /waitUntil\(push\.catch/);
  assert.match(webhook, /isSharkBotPushEvent\(normalized\.eventType\)/);
  assert.doesNotMatch(webhook, /console\.log\([^\n]+eventKey/);
  assert.match(pushRoute, /requirePlatformAdmin\(request\)/);
  assert.match(pushRoute, /db\.delete\(pushSubscriptions\)/);
  assert.match(pushRoute, /action === "sale"/);
  assert.match(pushRoute, /action === "preferences"/);
  assert.match(pushRoute, /deliverSharkBotManualSalePush/);
  assert.match(serviceWorker, /showNotification/);
  assert.match(serviceWorker, /notification-badge-96\.png/);
  assert.match(serviceWorker, /notificationclick/);
  assert.match(component, /Notification\.requestPermission\(\)/);
  assert.match(component, /Gerar notificação de venda/);
  assert.match(component, /action: "sale"/);
  assert.match(component, /registration\.showNotification\("Nova Venda!"/);
  assert.ok(component.indexOf("Notification.requestPermission()") > component.indexOf("async function activate"));
});
