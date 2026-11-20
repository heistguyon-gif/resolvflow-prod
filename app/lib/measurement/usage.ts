import { digest, OWNER_SCOPE, USAGE, type Usage } from "./model";
import type { MeasurementStore } from "./storage";

export async function recordUsage(store: MeasurementStore, key: string, actorId: string, action: unknown, now: number) {
  if (!USAGE.some(value => value === action) || key.length < 32) return false;
  const day = new Date(now).toISOString().slice(0, 10);
  const signingKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", signingKey, new TextEncoder().encode(JSON.stringify([OWNER_SCOPE, day, actorId])));
  const subject = Array.from(new Uint8Array(signed), byte => byte.toString(16).padStart(2, "0")).join("");
  const id = await digest(subject + "|" + action);
  await store.once(OWNER_SCOPE + "/usage/" + id, {id, subject, at: Date.parse(day), usage: action as Usage});
  return true;
}
