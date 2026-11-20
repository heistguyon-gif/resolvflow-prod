import { PUBLIC_ORIGIN, PUBLIC_PATH } from "./model";

export function isPublicMeasurementRoute(url: URL, method: string, flag?: string) {
  if (url.origin !== PUBLIC_ORIGIN || flag !== "true") return false;
  if (url.pathname === PUBLIC_PATH) return method === "GET" || method === "HEAD";
  if (url.pathname === "/api/measurement/telemetry") return method === "POST";
  return url.pathname === "/api/measurement/public" && (method === "GET" || method === "POST");
}
