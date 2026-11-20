import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { systemHealth } from "../db/schema";

export const PUBLISH_PACE_KEY = "publish_pace";
export type PublishPace = "economy" | "normal" | "fast";

export function normalizePace(value: unknown): PublishPace | null {
  return value === "economy" || value === "normal" || value === "fast" ? value : null;
}

export function paceLimit(pace: PublishPace) {
  if (pace === "economy") return 12;
  if (pace === "fast") return 120;
  return 80;
}

export async function readPublishPace(): Promise<PublishPace> {
  try {
    const [row] = await getDb().select({ status: systemHealth.status }).from(systemHealth).where(eq(systemHealth.key, PUBLISH_PACE_KEY)).limit(1);
    return normalizePace(row?.status) ?? "fast";
  } catch {
    return "fast";
  }
}
