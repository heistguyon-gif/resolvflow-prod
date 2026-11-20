import type { Dispatch, MetaContext } from "./collection";
import { PIXEL_ID, PUBLIC_ORIGIN, PUBLIC_PATH } from "./model";

export function metaDispatch(version?: string, token?: string, transport: typeof fetch = fetch): Dispatch | undefined {
  if (!version || !/^v\d{2}\.0$/.test(version) || !token) return undefined;
  return async (event, context) => {
    if (event.sourceUrl !== PUBLIC_ORIGIN + PUBLIC_PATH) return "rejected";
    const currencyAndValue = event.amountCents && event.currency
      ? { custom_data: { currency: event.currency, value: event.amountCents / 100 } } : {};
    try {
      const response = await transport(`https://graph.facebook.com/${version}/${PIXEL_ID}/events`, {
        method: "POST",
        redirect: "error",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ data: [{
          event_name: event.name, event_id: event.eventId,
          event_time: Math.floor(event.at / 1000), event_source_url: event.sourceUrl, action_source: "website",
          user_data: { fbp: context.fbp, client_user_agent: context.userAgent }, ...currencyAndValue,
        }] }),
        signal: AbortSignal.timeout(5000),
      });
      if (response.status >= 500 || response.status === 429) return "uncertain";
      if (!response.ok) return "rejected";
      const receipt = await response.json();
      return receipt && typeof receipt === "object" && "events_received" in receipt &&
        receipt.events_received === 1 ? "accepted" : "uncertain";
    } catch {
      return "uncertain";
    }
  };
}

export function metaContext(request: Request): MetaContext | undefined {
  const fbp = request.headers.get("cookie")?.match(/(?:^|;\s*)_fbp=(fb\.1\.\d{10,16}\.\d{1,24})(?:;|$)/)?.[1];
  const userAgent = request.headers.get("user-agent");
  if (fbp && userAgent && userAgent.length <= 512) return { fbp, userAgent };
}
