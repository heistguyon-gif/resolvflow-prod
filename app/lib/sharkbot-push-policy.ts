export const SHARKBOT_ADMIN_EMAIL = "lucasbgn.affiliate@gmail.com";

export type PushSubscriptionCandidate = {
  id: string;
  ownerUserId: string;
  accountUserId: string;
  disabledAt?: string | null;
  notifyNewLead?: boolean;
  notifyPaymentCreated?: boolean;
  notifyPaymentApproved?: boolean;
};

export type SharkBotPushEventType = "new_lead" | "payment_created" | "payment_approved";

export function isSharkBotPushEvent(eventType: string) {
  return eventType === "payment_approved" || eventType === "payment_created" || eventType === "new_lead";
}

export function subscriptionWantsSharkBotEvent(subscription: PushSubscriptionCandidate, eventType: SharkBotPushEventType) {
  if (eventType === "new_lead") return subscription.notifyNewLead !== false;
  if (eventType === "payment_created") return subscription.notifyPaymentCreated === true;
  return subscription.notifyPaymentApproved !== false;
}

export function selectAdminPushSubscriptions<T extends PushSubscriptionCandidate>(
  subscriptions: T[],
  ownerUserId: string,
  accountUserId: string,
) {
  return subscriptions.filter((subscription) => (
    subscription.ownerUserId === ownerUserId
    && subscription.accountUserId === accountUserId
    && !subscription.disabledAt
  ));
}

export function isExpiredPushSubscription(status: number) {
  return status === 404 || status === 410;
}

export function safeSalePushPayload(input: { eventId: string; amountCents: number; currency: string; productName: string | null }) {
  let amount = "";
  if (input.amountCents > 0) {
    try {
      amount = new Intl.NumberFormat("pt-BR", { style: "currency", currency: input.currency || "BRL" }).format(input.amountCents / 100);
    } catch {
      amount = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(input.amountCents / 100);
    }
  }
  return declarativePushPayload({
    title: "Nova Venda!",
    body: amount ? `Você recebeu ${amount}` : "Você recebeu uma nova venda.",
    tag: `sharkbot-sale-${input.eventId}`,
  });
}

function formattedAmount(amountCents: number, currency: string) {
  if (amountCents <= 0) return "";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(amountCents / 100);
  } catch {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amountCents / 100);
  }
}

export function sharkBotEventPushPayload(input: { eventId: string; eventType: SharkBotPushEventType; amountCents: number; currency: string }) {
  if (input.eventType === "payment_approved") return safeSalePushPayload({ ...input, productName: null });
  const amount = formattedAmount(input.amountCents, input.currency);
  if (input.eventType === "payment_created") {
    return declarativePushPayload({
      title: "Novo pedido pendente",
      body: amount ? `Pagamento de ${amount} aguardando confirmação.` : "Um novo pagamento foi criado e aguarda confirmação.",
      tag: `sharkbot-payment-created-${input.eventId}`,
    });
  }
  return declarativePushPayload({
    title: "Novo lead no bot",
    body: "Um novo lead iniciou o bot.",
    tag: `sharkbot-lead-${input.eventId}`,
  });
}

export function simulatedStartAmountCents(seed: string) {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return 999 + ((hash >>> 0) % 3001);
}

export function simulatedStartPushPayload(input: { eventId: string; amountCents: number }) {
  const amount = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(input.amountCents / 100);
  return declarativePushPayload({
    title: "Nova Venda!",
    body: `Você recebeu ${amount}`,
    tag: `sharkbot-start-simulation-${input.eventId}`,
  });
}

export function declarativePushPayload(input: { title: string; body: string; tag: string }) {
  return {
    web_push: 8030,
    notification: {
      title: input.title,
      lang: "pt-BR",
      dir: "ltr",
      body: input.body,
      navigate: "https://resolvflow.online/integracoes",
      tag: input.tag,
      silent: false,
      app_badge: "1",
    },
  } as const;
}

export async function dispatchPushBatch<T extends PushSubscriptionCandidate>(input: {
  subscriptions: T[];
  eventId: string | null;
  claim: (eventId: string, subscription: T) => Promise<boolean>;
  send: (subscription: T) => Promise<{ ok: boolean; status: number }>;
  delivered: (subscription: T, status: number) => Promise<void>;
  expired: (subscription: T, status: number) => Promise<void>;
  failed: (subscription: T, status: number) => Promise<void>;
}) {
  const results = await Promise.all(input.subscriptions.map(async (subscription) => {
    if (input.eventId && !await input.claim(input.eventId, subscription)) return "duplicate" as const;
    try {
      const response = await input.send(subscription);
      if (response.ok) {
        await input.delivered(subscription, response.status);
        return "delivered" as const;
      }
      if (isExpiredPushSubscription(response.status)) {
        await input.expired(subscription, response.status);
        return "expired" as const;
      }
      await input.failed(subscription, response.status);
      return "failed" as const;
    } catch {
      await input.failed(subscription, 0);
      return "failed" as const;
    }
  }));
  return {
    delivered: results.filter((result) => result === "delivered").length,
    expired: results.filter((result) => result === "expired").length,
    failed: results.filter((result) => result === "failed").length,
    duplicate: results.filter((result) => result === "duplicate").length,
  };
}
