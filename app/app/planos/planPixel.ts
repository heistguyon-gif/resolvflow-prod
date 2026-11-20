import { PIXEL_ID, PUBLIC_ORIGIN, PUBLIC_PATH } from "../../lib/measurement/model";

type Queue = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[][];
  push?: Queue;
  loaded?: boolean;
  version?: string;
};
type PixelWindow = Window & { fbq?: Queue; _fbq?: Queue; __rfPixelReady?: boolean };

const fired = new Set<string>();

export function ensurePixel() {
  if (typeof window === "undefined") return null;
  if (window.location.origin !== PUBLIC_ORIGIN || window.location.pathname !== PUBLIC_PATH) return null;
  const page = window as PixelWindow;
  if (!page.fbq) {
    const queue: Queue = (...args) => (queue.callMethod ? queue.callMethod(...args) : queue.queue?.push(args));
    queue.queue = [];
    queue.push = queue;
    queue.loaded = true;
    queue.version = "2.0";
    page.fbq = page._fbq = queue;
    queue("set", "autoConfig", false, PIXEL_ID);
    queue("init", PIXEL_ID);
    if (!document.getElementById("rf-fbevents")) {
      const script = document.createElement("script");
      script.id = "rf-fbevents";
      script.async = true;
      script.src = "https://connect.facebook.net/en_US/fbevents.js";
      script.referrerPolicy = "no-referrer";
      document.head.appendChild(script);
    }
    page.__rfPixelReady = true;
  }
  return page.fbq;
}

export function trackPixel(name: "PageView" | "InitiateCheckout" | "Purchase", eventId: string, data?: Record<string, unknown>) {
  if (!eventId || fired.has(name + ":" + eventId)) return;
  const fbq = ensurePixel();
  if (!fbq) return;
  fired.add(name + ":" + eventId);
  fbq("trackSingle", PIXEL_ID, name, data || {}, { eventID: eventId });
}

export function trackPageView() {
  const key = "rf-pixel-pageview";
  try {
    if (sessionStorage.getItem(key)) {
      ensurePixel();
      return;
    }
    sessionStorage.setItem(key, "1");
  } catch { /* sessionStorage may be blocked */ }
  trackPixel("PageView", crypto.randomUUID());
}

export function trackInitiateCheckout(plan: { id: string; label: string; amountCents: number }) {
  const storageKey = "rf-pixel-ic:" + plan.id;
  let eventId = "";
  try {
    eventId = sessionStorage.getItem(storageKey) || "";
    if (!eventId) {
      eventId = crypto.randomUUID();
      sessionStorage.setItem(storageKey, eventId);
    }
  } catch {
    eventId = crypto.randomUUID();
  }
  trackPixel("InitiateCheckout", eventId, {
    content_ids: [plan.id],
    content_name: plan.label,
    content_type: "product",
    currency: "BRL",
    value: plan.amountCents / 100,
    num_items: 1,
  });
  return eventId;
}

/** Only call after Lezty-confirmed paid status. Never call for pending/uncertain. */
export function trackPurchase(order: { id: string; plan: { id: string; label: string; amountCents: number } }) {
  if (!/^[a-f0-9]{64}$/.test(order.id)) return;
  trackPixel("Purchase", order.id, {
    content_ids: [order.plan.id],
    content_name: order.plan.label,
    content_type: "product",
    currency: "BRL",
    value: order.plan.amountCents / 100,
    num_items: 1,
  });
}
