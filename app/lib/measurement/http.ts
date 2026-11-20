import { readLimitedBody } from "../request-body";
import { readChoice, recordBrowser, saveChoice, type CollectionConfig } from "./collection";
import { attribution, digest, ID, PUBLIC_ORIGIN, PUBLIC_PATH } from "./model";
import { metaContext } from "./meta";
import type { MeasurementStore } from "./storage";

const cookie = "__Host-rf-measurement";
function result(body: unknown, status = 200, session?: string) {
  const headers = new Headers({ "cache-control": "private, no-store", "referrer-policy": "no-referrer" });
  if (session) headers.set("set-cookie", `${cookie}=${session}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict`);
  return Response.json(body, { status, headers });
}
function exact(body: Record<string, unknown>, keys: string[]) {
  return Object.keys(body).every(key => keys.includes(key));
}

export async function publicMeasurement(request: Request, runtime: {
  store: MeasurementStore | null; config: CollectionConfig; campaigns: readonly string[];
}) {
  const { store, config, campaigns } = runtime;
  const url = new URL(request.url);
  if (url.origin !== PUBLIC_ORIGIN || url.pathname !== "/api/measurement/public" || !config.enabled || !store) return result({ status: "disabled" }, 404);
  const raw = request.headers.get("cookie")?.match(/(?:^|;\s*)__Host-rf-measurement=([^;]*)/)?.[1] || "";
  const session = ID.test(raw) ? await digest(raw) : "";
  try {
    if (request.method === "GET") {
      const choice = await readChoice(store, session, Date.now());
      return result({ choice: choice ? { analytics: choice.analytics, marketing: choice.marketing } : null });
    }
    if (request.method !== "POST" || request.headers.get("origin") !== PUBLIC_ORIGIN ||
        request.headers.get("referer") !== PUBLIC_ORIGIN + PUBLIC_PATH) return result({ status: "blocked" }, 403);
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return result({ status: "invalid" }, 415);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 768)));
      if (!body || typeof body !== "object" || Array.isArray(body)) throw Error("invalid");
    } catch { return result({ status: "invalid" }, 400); }
    if (body.act === "choice" && exact(body, ["act", "analytics", "marketing"]) &&
        typeof body.analytics === "boolean" && typeof body.marketing === "boolean") {
      // Mark the old session non-reusable before creating a fresh one.
      if (session) await store.once("revoked/" + session, true);
      const next = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
      await saveChoice(store, await digest(next), { analytics: body.analytics, marketing: body.marketing }, Date.now());
      return result({ status: "saved" }, 200, next);
    }
    if (body.act !== "event" || !exact(body, ["act", "stage", "id", "source", "campaign", "referrerHost"]) ||
        typeof body.id !== "string" || !session) return result({ status: "invalid" }, 400);
    const landing = new URL(PUBLIC_PATH, PUBLIC_ORIGIN);
    if (typeof body.source === "string" && /^[a-z]{1,16}$/.test(body.source)) landing.searchParams.set("utm_source", body.source);
    if (typeof body.campaign === "string" && campaigns.includes(body.campaign)) landing.searchParams.set("utm_campaign", body.campaign);
    const referrer = typeof body.referrerHost === "string" && /^[a-z0-9.-]{1,100}$/.test(body.referrerHost) ? "https://" + body.referrerHost : "";
    const appResult = await recordBrowser(store, config, {
      journey: session, eventId: body.id, stage: body.stage, at: Date.now(), attribution: attribution(landing.href, referrer, campaigns),
    }, config.pixel ? metaContext(request) : undefined);
    return result(appResult);
  } catch { return result({ status: "unavailable" }, 503); }
}
