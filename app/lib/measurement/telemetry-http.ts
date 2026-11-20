import { readLimitedBody } from "../request-body";
import { ID, PUBLIC_ORIGIN } from "./model";
import { parseTelemetryBody, recordTelemetry, telemetryAllowed } from "./telemetry";
import type { MeasurementStore } from "./storage";

const cookie = "__Host-rf-funnel";

function result(body: unknown, status = 200, session?: string) {
  const headers = new Headers({ "cache-control": "private, no-store", "referrer-policy": "no-referrer" });
  if (session) headers.set("set-cookie", `${cookie}=${session}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`);
  return Response.json(body, { status, headers });
}

export async function publicTelemetry(request: Request, store: MeasurementStore | null, enabled: boolean) {
  const url = new URL(request.url);
  if (url.origin !== PUBLIC_ORIGIN || url.pathname !== "/api/measurement/telemetry" || !enabled || !store) {
    return result({ status: "disabled" }, 404);
  }
  if (request.method !== "POST") return result({ status: "method_not_allowed" }, 405);
  const origin = request.headers.get("origin") || "";
  if (!telemetryAllowed(origin, request.headers.get("referer"))) return result({ status: "blocked" }, 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return result({ status: "invalid" }, 415);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 1024)));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error("invalid");
  } catch {
    return result({ status: "invalid" }, 400);
  }
  const payload = parseTelemetryBody(body);
  if (!payload) return result({ status: "invalid" }, 400);
  const existing = request.headers.get("cookie")?.match(/(?:^|;\s*)__Host-rf-funnel=([a-f0-9]{64})(?:;|$)/)?.[1] || "";
  const session = ID.test(existing) ? existing : crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  try {
    const saved = await recordTelemetry(store, session, payload);
    return result({ status: saved.status }, 200, ID.test(existing) ? undefined : session);
  } catch {
    return result({ status: "unavailable" }, 503);
  }
}
