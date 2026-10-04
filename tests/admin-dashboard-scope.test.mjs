import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("a visão consolidada só é aceita para o administrador da plataforma", async () => {
  const routes = await Promise.all([
    source("app/api/accounts/route.ts"),
    source("app/api/reports/route.ts"),
    source("app/api/queue/route.ts"),
  ]);

  for (const route of routes) {
    assert.match(route, /scope"\) === "platform"/);
    assert.match(route, /isPlatformAdminEmail\(context\.email\)|viewerIsAdmin/);
    assert.match(route, /platformScope \? "platform" : "workspace"/);
  }
});

test("a dashboard permite ao admin alternar o escopo e identifica contas saudáveis", async () => {
  const dashboard = await source("app/components/NexoFlowDashboard.tsx");

  assert.match(dashboard, /setDashboardScope\("platform"\)/);
  assert.match(dashboard, /children: "Todas as contas"/);
  assert.match(dashboard, /scope=platform/);
  assert.match(dashboard, /contas saudáveis/);
  assert.match(dashboard, /"Conectada" === e\.connectionStatus && "Saudável" === Ce\(e\)/);
});
