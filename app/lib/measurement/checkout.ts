import { recordConversion, type CollectionConfig, type MetaContext } from "./collection";
import type { Attribution, Plan } from "./model";
import type { MeasurementStore } from "./storage";

/** Projection returned by a future commercial checkout repository, after its own durable commit. */
export type CheckoutOrder = {
  id: string;
  attemptId: string;
  journey: string;
  attribution: Attribution;
  openedAt: number | null;
  source: "commercial" | "pilot" | "demo" | "gmail";
  plan: Plan;
  amountCents: number;
  currency: string;
  payment: {state: "pending" | "paid" | "failed"; verifiedAt: number | null; paidCents: number | null; currency: string | null};
};

// The browser never invokes this connector. The caller selects the committed attempt/order;
// checkout-open and signed/verified payment handlers call it only after their canonical transition.
export function measureCheckout(store: MeasurementStore, config: CollectionConfig, transition: "opened" | "payment",
  loadOrder: () => Promise<CheckoutOrder | null>, match?: MetaContext) {
  return recordConversion(store, config, async () => {
    const order = await loadOrder();
    if (!order || order.source !== "commercial" || order.openedAt === null) return null;
    const common = {kind: "order" as const, journey: order.journey, environment: "commercial" as const,
      attribution: order.attribution, plan: order.plan};
    if (transition === "opened") return {...common, factId: order.attemptId, at: order.openedAt, state: "started"};
    const payment = order.payment;
    if (payment.state !== "paid" || payment.verifiedAt === null || payment.verifiedAt < order.openedAt ||
        payment.paidCents !== order.amountCents || order.currency !== "BRL" || payment.currency !== "BRL") return null;
    return {...common, factId: order.id, at: payment.verifiedAt, state: "confirmed", amountCents: order.amountCents, currency: "BRL"};
  }, match);
}
