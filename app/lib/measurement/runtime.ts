import { env } from "cloudflare:workers";
import { measurementStore, type MeasurementBucket } from "./storage";
import { metaDispatch } from "./meta";

type MeasurementBindings = {
  MEASUREMENT_PUBLIC_ROUTE?: string;
  MEASUREMENT_FIRST_PARTY?: string;
  MEASUREMENT_META?: string;
  MEASUREMENT_PRIVACY_NOTICE?: string;
  MEASUREMENT_USAGE?: string;
  MEASUREMENT_STORE?: MeasurementBucket;
  MEASUREMENT_META_ACCESS_TOKEN?: string;
  MEASUREMENT_GRAPH_VERSION?: string;
  MEASUREMENT_CAMPAIGNS?: string;
  MEASUREMENT_USAGE_KEY?: string;
};

export function measurementRuntime() {
  const settings = env as MeasurementBindings;
  const store = settings.MEASUREMENT_STORE ? measurementStore(settings.MEASUREMENT_STORE) : null;
  const publicRoute = settings.MEASUREMENT_PUBLIC_ROUTE === "true";
  const noticeReady = settings.MEASUREMENT_PRIVACY_NOTICE === "true";
  const enabled = publicRoute && noticeReady && settings.MEASUREMENT_FIRST_PARTY === "true" && Boolean(store);
  // Browser Pixel can run without CAPI. CAPI only when the server token secret already exists.
  const dispatch = enabled && settings.MEASUREMENT_META === "true"
    ? metaDispatch(settings.MEASUREMENT_GRAPH_VERSION, settings.MEASUREMENT_META_ACCESS_TOKEN)
    : undefined;
  const browserPixel = publicRoute && (enabled ? settings.MEASUREMENT_META !== "false" : true);

  return {
    store, publicRoute, campaigns: (settings.MEASUREMENT_CAMPAIGNS || "").split(","),
    config: { enabled, pixel: Boolean(dispatch) || browserPixel, dispatch },
    usageKey: noticeReady && settings.MEASUREMENT_USAGE === "true" ? settings.MEASUREMENT_USAGE_KEY : undefined,
  };
}
