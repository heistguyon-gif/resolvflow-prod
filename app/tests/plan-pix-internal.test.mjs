import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadPix } from "./helpers/pix-gateway-fixture.mjs";

const workerSource = readFileSync("worker/index.ts", "utf8");
const pixSource = readFileSync("lib/plan-pix-bravo.ts", "utf8");
const { handlePlanPixBravoRequest } = loadPix("lib/plan-pix-bravo.ts");

test("plan Pix route has no hardcoded shared gate value anymore", () => {
  assert.doesNotMatch(pixSource, /rf-plan-pix-bravo-v1/);
  assert.doesNotMatch(pixSource, /x-rf-plan-pix-internal/);
  assert.doesNotMatch(pixSource, /cf-worker/i);
  assert.doesNotMatch(workerSource, /handlePlanPixBravoRequest\(request, env\)/, "public fetch handler must not call the Pix handler");
});

test("public fetch handler answers 404 for every /__internal path before anything else", () => {
  const start = workerSource.indexOf("async function handleWorkerFetch");
  const guard = workerSource.indexOf('url.pathname.startsWith("/__internal/")', start);
  const firstRoute = workerSource.indexOf("MEASUREMENT_PUBLIC_ROUTE", start);
  assert.ok(start > 0 && guard > start && guard < firstRoute, "internal guard is the first route check");
  assert.match(workerSource.slice(guard, guard + 300), /status: 404/);
});

test("Pix handler is exposed only via the PlanPixBravo named entrypoint", () => {
  assert.match(workerSource, /export class PlanPixBravo extends WorkerEntrypoint<Env>/);
  assert.match(workerSource, /handlePlanPixBravoRequest\(request, this\.env\)/);
  const landingStage = readFileSync("../landing/wrangler.stage.jsonc", "utf8");
  assert.match(landingStage, /"binding": "PLAN_PIX_BRAVO",\s*"service": "nexoflow-operacao-mk",\s*"entrypoint": "PlanPixBravo"/);
});

test("entrypoint handler serves health without any gate header and still rejects unknown paths", async () => {
  const env = { EYT_API_KEY: "k", EYT_CLIENT_ID: "c" };
  const health = await handlePlanPixBravoRequest(new Request("https://plan-pix-bravo.internal/__internal/plan-pix-bravo/health"), env);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ready: true, provider: "eyt" });
  const unknown = await handlePlanPixBravoRequest(new Request("https://plan-pix-bravo.internal/__internal/other"), env);
  assert.equal(unknown.status, 404);
  const invalid = await handlePlanPixBravoRequest(new Request("https://plan-pix-bravo.internal/__internal/plan-pix-bravo/transactions", { method: "POST", body: "{}" }), env);
  assert.equal(invalid.status, 400);
});
