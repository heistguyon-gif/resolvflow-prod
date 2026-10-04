import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { pushSubscriptions, sharkbotPushDeliveries } from "../db/schema";
import { runtimeEnv } from "./runtime-env";
import { declarativePushPayload, dispatchPushBatch, safeSalePushPayload, sharkBotEventPushPayload, simulatedStartPushPayload, subscriptionWantsSharkBotEvent, type SharkBotPushEventType } from "./sharkbot-push-policy";
import { isValidVapidConfig, sendWebPush } from "./web-push";

type PushTarget = { ownerUserId: string; accountUserId: string };
type SaleForPush = { id: string; amountCents: number; currency: string; productName: string | null };

function vapidConfig() {
  const values = runtimeEnv();
  const publicKey = values.VAPID_PUBLIC_KEY?.trim() || "";
  const privateKey = values.VAPID_PRIVATE_KEY?.trim() || "";
  const subject = values.VAPID_SUBJECT?.trim() || `mailto:${values.NEXOFLOW_OWNER_EMAIL?.trim() || "admin@resolvflow.online"}`;
  const config = { publicKey, privateKey, subject };
  return { configured: isValidVapidConfig(config), ...config };
}

export function publicPushConfiguration() {
  const config = vapidConfig();
  return { configured: config.configured, publicKey: config.configured ? config.publicKey : null };
}

async function activeSubscriptions(target: PushTarget, eventType?: SharkBotPushEventType) {
  const subscriptions = await getDb().select().from(pushSubscriptions).where(and(
    eq(pushSubscriptions.ownerUserId, target.ownerUserId),
    eq(pushSubscriptions.accountUserId, target.accountUserId),
    isNull(pushSubscriptions.disabledAt),
  ));
  return eventType ? subscriptions.filter((subscription) => subscriptionWantsSharkBotEvent(subscription, eventType)) : subscriptions;
}

async function dispatch(target: PushTarget, eventId: string | null, payload: unknown, eventType?: SharkBotPushEventType) {
  const config = vapidConfig();
  if (!config.configured) return { delivered: 0, expired: 0, failed: 0, duplicate: 0, configured: false };
  const db = getDb();
  const subscriptions = await activeSubscriptions(target, eventType);
  const result = await dispatchPushBatch({
    subscriptions,
    eventId,
    claim: async (claimedEventId, subscription) => {
      const inserted = await db.insert(sharkbotPushDeliveries).values({
        id: crypto.randomUUID(), eventId: claimedEventId, subscriptionId: subscription.id, status: "sending",
      }).onConflictDoNothing().returning({ id: sharkbotPushDeliveries.id });
      return inserted.length > 0;
    },
    send: async (subscription) => {
      const response = await sendWebPush(subscription, payload, config);
      return { ok: response.ok, status: response.status };
    },
    delivered: async (subscription, status) => {
      const now = new Date().toISOString();
      if (eventId) await db.update(sharkbotPushDeliveries).set({ status: "delivered", providerStatus: status, updatedAt: now }).where(and(eq(sharkbotPushDeliveries.eventId, eventId), eq(sharkbotPushDeliveries.subscriptionId, subscription.id)));
      await db.update(pushSubscriptions).set({ lastSuccessAt: now, updatedAt: now }).where(eq(pushSubscriptions.id, subscription.id));
    },
    expired: async (subscription, status) => {
      const now = new Date().toISOString();
      if (eventId) await db.update(sharkbotPushDeliveries).set({ status: "expired", providerStatus: status, errorCode: "subscription_expired", updatedAt: now }).where(and(eq(sharkbotPushDeliveries.eventId, eventId), eq(sharkbotPushDeliveries.subscriptionId, subscription.id)));
      await db.delete(pushSubscriptions).where(and(
        eq(pushSubscriptions.id, subscription.id),
        eq(pushSubscriptions.ownerUserId, target.ownerUserId),
        eq(pushSubscriptions.accountUserId, target.accountUserId),
      ));
    },
    failed: async (subscription, status) => {
      if (eventId) await db.update(sharkbotPushDeliveries).set({ status: "failed", providerStatus: status || null, errorCode: status ? `provider_${status}` : "network_error", updatedAt: new Date().toISOString() }).where(and(eq(sharkbotPushDeliveries.eventId, eventId), eq(sharkbotPushDeliveries.subscriptionId, subscription.id)));
    },
  });
  return { ...result, configured: true };
}

export async function deliverSharkBotSalePush(target: PushTarget, sale: SaleForPush) {
  const result = await dispatch(target, sale.id, safeSalePushPayload({ ...sale, eventId: sale.id }), "payment_approved");
  console.log(JSON.stringify({ type: "sharkbot.push", eventId: sale.id, ...result }));
  return result;
}

export async function deliverSharkBotEventPush(target: PushTarget, event: { id: string; eventType: SharkBotPushEventType; amountCents: number; currency: string }) {
  const result = await dispatch(target, event.id, sharkBotEventPushPayload({
    eventId: event.id,
    eventType: event.eventType,
    amountCents: event.amountCents,
    currency: event.currency,
  }), event.eventType);
  console.log(JSON.stringify({ type: "sharkbot.push", eventId: event.id, eventType: event.eventType, ...result }));
  return result;
}

export async function deliverSharkBotStartSimulationPush(target: PushTarget, input: { id: string; amountCents: number }) {
  const result = await dispatch(target, input.id, simulatedStartPushPayload({
    eventId: input.id,
    amountCents: input.amountCents,
  }));
  console.log(JSON.stringify({ type: "sharkbot.push.simulation", eventId: input.id, ...result }));
  return result;
}

export async function deliverSharkBotTestPush(target: PushTarget) {
  return dispatch(target, null, declarativePushPayload({
    title: "Notificações da Resolve Flow ativas",
    body: "Este dispositivo está pronto para receber vendas aprovadas.",
    tag: `sharkbot-test-${Date.now()}`,
  }));
}

export async function deliverSharkBotManualSalePush(target: PushTarget) {
  const eventId = `manual-${crypto.randomUUID()}`;
  const amountCents = simulatedStartAmountCents(eventId);
  const payload = safeSalePushPayload({
    eventId,
    amountCents,
    currency: "BRL",
    productName: null,
  });
  const result = await dispatch(target, null, payload);
  return { ...result, amountCents, tag: payload.notification.tag };
}
