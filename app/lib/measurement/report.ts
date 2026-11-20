import { OWNER_SCOPE, PLANS, STAGES, USAGE, type Delivery, type FunnelEvent, type UsageEvent } from "./model";
import type { MeasurementStore } from "./storage";
import { TELEMETRY_ROOT, TELEMETRY_STAGES, type TelemetryEvent, type TelemetryStage } from "./telemetry";

type DeliveryRecord = {id: string; state: Delivery};
export type Snapshot = {
  mode: "fixture" | "stored";
  events: FunnelEvent[];
  duplicates: string[];
  delivery: DeliveryRecord[];
  usage: UsageEvent[];
  complete: boolean;
};
export type TelemetrySnapshot = { events: TelemetryEvent[]; complete: boolean; mode: "empty" | "stored" };
export type Filters = { from: string; to: string; source: string; campaign: string; landing: string; stage: string; plan: string };
export const emptyFilters: Filters = {from: "", to: "", source: "", campaign: "", landing: "", stage: "", plan: ""};

function isTelemetryEvent(value: unknown): value is TelemetryEvent {
  if (!value || typeof value !== "object") return false;
  const row = value as TelemetryEvent;
  return typeof row.id === "string" && typeof row.journey === "string" && typeof row.at === "number" &&
    (row.kind === "lead" || row.kind === "click" || row.kind === "stage");
}

export async function readSnapshot(store: MeasurementStore): Promise<Snapshot> {
  const prefix = OWNER_SCOPE + "/";
  const [events, duplicates, delivery, usage] = await Promise.all(
    ["funnel/", "duplicate/", "delivery/", "usage/"].map(key => store.list(prefix + key)),
  );
  return {
    mode: "stored", events: events.values as FunnelEvent[],
    duplicates: (duplicates.values as {id: string}[]).map(row => row.id),
    delivery: delivery.values as DeliveryRecord[], usage: usage.values as UsageEvent[],
    complete: [events, duplicates, delivery, usage].every(page => page.complete),
  };
}

export async function readTelemetrySnapshot(store: MeasurementStore): Promise<TelemetrySnapshot> {
  const listed = await store.list(TELEMETRY_ROOT + "events/");
  return {
    mode: listed.values.length ? "stored" : "empty",
    events: listed.values.filter(isTelemetryEvent),
    complete: listed.complete,
  };
}

export function report(snapshot: Snapshot, filters: Filters) {
  const from = filters.from ? Date.parse(filters.from) : -Infinity;
  const to = filters.to ? Date.parse(filters.to) + 86_400_000 : Infinity;
  const inPeriod = (at: number) => at >= from && at < to;
  const matching = snapshot.events.filter(row => inPeriod(row.at) &&
    (!filters.source || row.attribution.source === filters.source) &&
    (!filters.campaign || row.attribution.campaign === filters.campaign) &&
    (!filters.landing || row.attribution.landing === filters.landing));
  const events = matching.filter(row => (!filters.stage || row.stage === filters.stage) &&
    (!filters.plan || row.plan === filters.plan));
  const cohort = new Set(matching.filter(row => row.analytics && row.stage === "page_view").map(row => row.journey));
  const rows = STAGES.filter(stage => !filters.stage || filters.stage === stage).map(stage => {
    const results = events.filter(row => row.analytics && row.stage === stage);
    const visits = new Set(results.map(row => row.journey));
    const inCohort = [...visits].filter(journey => cohort.has(journey)).length;
    const instrumented = snapshot.mode === "fixture" || stage === "page_view" || stage === "view_content" || results.length > 0;
    return {stage, events: instrumented ? results.length : null, journeys: instrumented ? visits.size : null,
      rate: instrumented && cohort.size && !filters.plan && snapshot.complete ? inCohort / cohort.size : null};
  });
  const ids = new Set(events.map(row => row.id));
  const delivery = {accepted: 0, rejected: 0, uncertain: 0, suppressed: 0, claimed: 0};
  for (const row of snapshot.delivery) if (ids.has(row.id) && Object.hasOwn(delivery, row.state)) delivery[row.state]++;
  return {
    mode: snapshot.mode, complete: snapshot.complete, denominator: cohort.size, rows, delivery,
    availableCampaigns: [...new Set(snapshot.events.flatMap(row => row.attribution.campaign ? [row.attribution.campaign] : []))].sort(),
    plans: PLANS,
    duplicates: snapshot.duplicates.filter(id => ids.has(id)).length,
    usage: USAGE.map(usage => ({usage,
      dailySubjects: new Set(snapshot.usage.filter(row => row.usage === usage && inPeriod(row.at)).map(row => row.subject)).size})),
  };
}

export function fixtureSnapshot(now = Date.now()): Snapshot {
  const events: FunnelEvent[] = [];
  for (let index = 0; index < 12; index++) {
    for (const [step, stage] of STAGES.entries()) {
      if (index >= [12, 9, 7, 4, 3, 2][step]) continue;
      events.push({
        id: `fixture-${index}-${step}`, journey: `fixture-${index}`, analytics: true, stage,
        at: now - 60_000 + step * 1000,
        attribution: {landing: "planos", source: index % 2 ? "direct" : "meta", campaign: index % 2 ? null : "demo-local"},
        ...(step >= 4 ? {plan: "entrada-essencial"} : {}),
      });
    }
  }
  return {
    mode: "fixture", events, complete: true, duplicates: ["fixture-0-0"],
    delivery: [{id:"fixture-0-0",state:"accepted"},{id:"fixture-1-0",state:"uncertain"},{id:"fixture-2-0",state:"suppressed"}],
    usage: [{id:"fixture",subject:"fixture",at:now - 30_000,usage:"workspace_opened"}],
  };
}

export function emptyTelemetrySnapshot(): TelemetrySnapshot {
  return { mode: "empty", events: [], complete: true };
}

function periodBounds(filters: Filters) {
  return {
    from: filters.from ? Date.parse(filters.from) : -Infinity,
    to: filters.to ? Date.parse(filters.to) + 86_400_000 : Infinity,
  };
}

export function reportTelemetry(snapshot: TelemetrySnapshot, filters: Filters) {
  const { from, to } = periodBounds(filters);
  const inPeriod = (at: number) => Number.isFinite(at) && at >= from && at < to;
  const periodEvents = snapshot.events.filter(row => inPeriod(row.at) && (!filters.landing || filters.landing === "planos"));
  const leads = periodEvents.filter(row => row.kind === "lead" &&
    (!filters.source || row.source === filters.source) &&
    (!filters.campaign || row.campaign === filters.campaign));
  const journeyAllow = (filters.source || filters.campaign)
    ? new Set(leads.map(row => row.journey))
    : null;
  const rows = periodEvents.filter(row => !journeyAllow || journeyAllow.has(row.journey));
  const clicks = rows.filter(row => row.kind === "click");
  const stages = rows.filter(row => row.kind === "stage");
  const heat = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => 0));
  let maxHeat = 0;
  for (const click of clicks) {
    if (typeof click.x !== "number" || typeof click.y !== "number") continue;
    const x = Math.min(19, Math.max(0, Math.floor(click.x * 20)));
    const y = Math.min(19, Math.max(0, Math.floor(click.y * 20)));
    heat[y][x] += 1;
    maxHeat = Math.max(maxHeat, heat[y][x]);
  }
  const stageRows = TELEMETRY_STAGES.map((stage: TelemetryStage) => {
    const samples = stages.filter(row => row.stage === stage);
    const dwellTotal = samples.reduce((sum, row) => sum + (row.dwellMs || 0), 0);
    const journeys = new Set(samples.map(row => row.journey));
    return {
      stage,
      samples: samples.length,
      journeys: journeys.size,
      dwellMs: dwellTotal,
      avgDwellMs: samples.length ? Math.round(dwellTotal / samples.length) : 0,
    };
  });
  const targets = new Map<string, number>();
  for (const click of clicks) {
    const key = click.target || "unknown";
    targets.set(key, (targets.get(key) || 0) + 1);
  }
  const topTargets = [...targets.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12)
    .map(([target, count]) => ({ target, count }));
  return {
    mode: snapshot.mode,
    complete: snapshot.complete,
    leads: leads.length,
    leadJourneys: new Set(leads.map(row => row.journey)).size,
    clicks: clicks.length,
    stageRows,
    heat: { cells: heat, max: maxHeat, columns: 20, rows: 20 },
    topTargets,
  };
}

export function adminMeasurementReport(snapshot: Snapshot, telemetry: TelemetrySnapshot, filters: Filters) {
  return { ...report(snapshot, filters), telemetry: reportTelemetry(telemetry, filters) };
}
