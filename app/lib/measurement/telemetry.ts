import { digest, ID, PUBLIC_ORIGIN, PUBLIC_PATH } from "./model";
import type { MeasurementStore } from "./storage";

export const TELEMETRY_ROOT = "telemetry/v1/";
const root = TELEMETRY_ROOT;
export const TELEMETRY_STAGES = ["entry", "hero", "demo", "offer", "checkout", "faq", "closing"] as const;
const STAGES = TELEMETRY_STAGES;
export type TelemetryStage = typeof STAGES[number];

export type TelemetryPayload =
  | { kind: "lead"; at: number; path: string; referrerHost?: string; source?: string; campaign?: string }
  | { kind: "click"; at: number; x: number; y: number; w: number; h: number; target: string; stage?: TelemetryStage }
  | { kind: "stage"; at: number; stage: TelemetryStage; dwellMs: number; enteredAt: number };

export type TelemetryEvent = TelemetryPayload & { id: string; journey: string; landing: "planos" };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function stageOk(value: unknown): value is TelemetryStage {
  return typeof value === "string" && (STAGES as readonly string[]).includes(value);
}

export function parseTelemetryBody(body: Record<string, unknown>): TelemetryPayload | null {
  if (body.kind === "lead" && typeof body.at === "number" && Number.isFinite(body.at) && typeof body.path === "string" && body.path === PUBLIC_PATH) {
    const payload: TelemetryPayload = { kind: "lead", at: body.at, path: PUBLIC_PATH };
    if (typeof body.referrerHost === "string" && /^[a-z0-9.-]{1,100}$/i.test(body.referrerHost)) payload.referrerHost = body.referrerHost.toLowerCase();
    if (typeof body.source === "string" && /^[a-z]{1,16}$/.test(body.source)) payload.source = body.source;
    if (typeof body.campaign === "string" && /^[a-z0-9][a-z0-9_-]{0,39}$/.test(body.campaign)) payload.campaign = body.campaign;
    return payload;
  }
  if (body.kind === "click" && typeof body.at === "number" && Number.isFinite(body.at) &&
      typeof body.x === "number" && typeof body.y === "number" && typeof body.w === "number" && typeof body.h === "number" &&
      typeof body.target === "string" && body.target.length > 0 && body.target.length <= 120) {
    return {
      kind: "click",
      at: body.at,
      x: clamp(body.x, 0, 1),
      y: clamp(body.y, 0, 1),
      w: clamp(Math.floor(body.w), 1, 10000),
      h: clamp(Math.floor(body.h), 1, 10000),
      target: body.target.replace(/[^\w.#:[\]=-]+/g, "").slice(0, 120),
      ...(stageOk(body.stage) ? { stage: body.stage } : {}),
    };
  }
  if (body.kind === "stage" && typeof body.at === "number" && Number.isFinite(body.at) && stageOk(body.stage) &&
      typeof body.dwellMs === "number" && Number.isFinite(body.dwellMs) && body.dwellMs >= 0 && body.dwellMs <= 3_600_000 &&
      typeof body.enteredAt === "number" && Number.isFinite(body.enteredAt)) {
    return { kind: "stage", at: body.at, stage: body.stage, dwellMs: Math.floor(body.dwellMs), enteredAt: body.enteredAt };
  }
  return null;
}

export async function recordTelemetry(store: MeasurementStore, sessionRaw: string, payload: TelemetryPayload) {
  if (!ID.test(sessionRaw)) throw Error("invalid_session");
  const journey = await digest(sessionRaw);
  const id = crypto.randomUUID();
  const record = { id, journey, ...payload, landing: "planos" as const };
  if (payload.kind === "lead") {
    const key = root + "lead/" + journey;
    if (!(await store.once(key, record))) return { status: "duplicate" as const, journey };
    await store.write(root + "events/" + journey + "/" + id, record);
    return { status: "saved" as const, journey };
  }
  await store.write(root + "events/" + journey + "/" + id, record);
  if (payload.kind === "click") {
    const cellX = Math.min(19, Math.floor(payload.x * 20));
    const cellY = Math.min(19, Math.floor(payload.y * 20));
    const heatKey = root + "heat/" + cellX + "x" + cellY;
    const previous = (await store.get(heatKey)) as { count?: number } | null;
    await store.write(heatKey, { x: cellX, y: cellY, count: Math.min(1_000_000, (previous?.count || 0) + 1), updatedAt: payload.at });
  }
  return { status: "saved" as const, journey };
}

export function telemetryAllowed(origin: string, referer: string | null) {
  return origin === PUBLIC_ORIGIN && (!referer || referer.startsWith(PUBLIC_ORIGIN + PUBLIC_PATH));
}
