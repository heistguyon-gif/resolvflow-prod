import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPix, bucket } from "./helpers/pix-gateway-fixture.mjs";

const load = (name) => loadPix("lib/measurement/" + name + ".ts");
const { measurementStore } = load("storage");
const { parseTelemetryBody, recordTelemetry } = load("telemetry");
const { publicTelemetry } = load("telemetry-http");
const { isPublicMeasurementRoute } = load("routing");
const { PUBLIC_ORIGIN, PUBLIC_PATH } = load("model");
const { adminMeasurementReport, emptyFilters, emptyTelemetrySnapshot, fixtureSnapshot, readTelemetrySnapshot, reportTelemetry } = load("report");

function fakeStorage() {
  const fake = bucket();
  fake.list = async ({ prefix }) => ({
    objects: [...fake.rows.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })),
    truncated: false,
  });
  return { store: measurementStore(fake), rows: fake.rows };
}

test("telemetry route is public on /planos measurement path", () => {
  assert.equal(isPublicMeasurementRoute(new URL(PUBLIC_ORIGIN + "/api/measurement/telemetry"), "POST", "true"), true);
  assert.equal(isPublicMeasurementRoute(new URL(PUBLIC_ORIGIN + "/api/measurement/telemetry"), "GET", "true"), false);
  assert.equal(isPublicMeasurementRoute(new URL(PUBLIC_ORIGIN + PUBLIC_PATH), "GET", "true"), true);
});

test("lead is accepted once per funnel session and clicks aggregate heat cells", async () => {
  const { store, rows } = fakeStorage();
  const session = "b".repeat(64);
  const lead = parseTelemetryBody({ kind: "lead", at: Date.now(), path: PUBLIC_PATH, source: "meta" });
  assert.equal(lead.kind, "lead");
  assert.equal((await recordTelemetry(store, session, lead)).status, "saved");
  assert.equal((await recordTelemetry(store, session, lead)).status, "duplicate");
  const click = parseTelemetryBody({ kind: "click", at: Date.now(), x: 0.12, y: 0.48, w: 1280, h: 2400, target: "button.plan-buy", stage: "offer" });
  assert.equal((await recordTelemetry(store, session, click)).status, "saved");
  assert.equal((await recordTelemetry(store, session, click)).status, "saved");
  const heat = [...rows.keys()].find((key) => key.includes("/heat/"));
  assert.ok(heat);
  assert.equal((await store.get(heat.slice("measurement/v1/".length))).count, 2);
});

test("public telemetry creates HttpOnly session and rejects forged purchase-like payloads", async () => {
  const { store } = fakeStorage();
  const bad = await publicTelemetry(new Request(PUBLIC_ORIGIN + "/api/measurement/telemetry", {
    method: "POST",
    headers: { origin: PUBLIC_ORIGIN, referer: PUBLIC_ORIGIN + PUBLIC_PATH, "content-type": "application/json" },
    body: JSON.stringify({ kind: "purchase", at: Date.now(), value: 127 }),
  }), store, true);
  assert.equal(bad.status, 400);
  const ok = await publicTelemetry(new Request(PUBLIC_ORIGIN + "/api/measurement/telemetry", {
    method: "POST",
    headers: { origin: PUBLIC_ORIGIN, referer: PUBLIC_ORIGIN + PUBLIC_PATH, "content-type": "application/json" },
    body: JSON.stringify({ kind: "lead", at: Date.now(), path: PUBLIC_PATH }),
  }), store, true);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("set-cookie") || "", /__Host-rf-funnel=[a-f0-9]{64}/);
  assert.equal((await ok.json()).status, "saved");
  const stage = parseTelemetryBody({ kind: "stage", at: Date.now(), stage: "checkout", dwellMs: 1500, enteredAt: Date.now() - 1500 });
  assert.equal(stage.stage, "checkout");
});

test("pending Pix payloads are not modeled as telemetry purchase conversions", () => {
  assert.equal(parseTelemetryBody({ kind: "purchase", id: "x", status: "paid" }), null);
  assert.equal(parseTelemetryBody({ kind: "lead", at: Date.now(), path: "/dashboard" }), null);
});

test("admin report aggregates private leads, heat cells and stage dwell from R2 events", async () => {
  const { store } = fakeStorage();
  const session = "c".repeat(64);
  const now = Date.now();
  await recordTelemetry(store, session, { kind: "lead", at: now - 5_000, path: PUBLIC_PATH, source: "meta" });
  await recordTelemetry(store, session, { kind: "click", at: now - 4_000, x: 0.05, y: 0.05, w: 1000, h: 2000, target: "button.plan-buy", stage: "offer" });
  await recordTelemetry(store, session, { kind: "click", at: now - 3_500, x: 0.05, y: 0.05, w: 1000, h: 2000, target: "button.plan-buy", stage: "offer" });
  await recordTelemetry(store, session, { kind: "stage", at: now - 3_000, stage: "offer", dwellMs: 4200, enteredAt: now - 7_200 });
  const telemetry = await readTelemetrySnapshot(store);
  assert.equal(telemetry.mode, "stored");
  const privateReport = reportTelemetry(telemetry, emptyFilters);
  assert.equal(privateReport.leads, 1);
  assert.equal(privateReport.clicks, 2);
  assert.equal(privateReport.heat.cells[1][1], 2);
  assert.equal(privateReport.stageRows.find((row) => row.stage === "offer").avgDwellMs, 4200);
  assert.equal(privateReport.topTargets[0].target, "button.plan-buy");
  const combined = adminMeasurementReport(fixtureSnapshot(now), telemetry, emptyFilters);
  assert.equal(combined.mode, "fixture");
  assert.equal(combined.telemetry.leads, 1);
  assert.equal(emptyTelemetrySnapshot().mode, "empty");
});
