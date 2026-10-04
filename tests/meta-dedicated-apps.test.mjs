import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Prado e Fabricio usam apps Meta exclusivos sem versionar os segredos", async () => {
  const [runtime, wrangler, ui, dashboard] = await Promise.all([
    source("lib/runtime-env.ts"),
    source("wrangler.jsonc"),
    source("app/components/ConnectQueue.tsx"),
    source("app/components/NexoFlowDashboard.tsx"),
  ]);

  assert.match(runtime, /PRADO_WORKSPACE_OWNER_ID = "af97a499-5b64-45e9-87c1-0854c152da26"/);
  assert.match(runtime, /FABRICIO_WORKSPACE_OWNER_ID = "c417bcbb-1d3a-421f-a8b2-7f7d4077d221"/);
  assert.match(runtime, /workspaceOwnerUserId === PRADO_WORKSPACE_OWNER_ID\) return \["prado"\]/);
  assert.match(runtime, /workspaceOwnerUserId === FABRICIO_WORKSPACE_OWNER_ID\) return \["fabricio"\]/);
  assert.match(runtime, /workspaceOwnerUserId === PRADO_WORKSPACE_OWNER_ID\) return "prado"/);
  assert.match(runtime, /workspaceOwnerUserId === FABRICIO_WORKSPACE_OWNER_ID\) return "fabricio"/);
  assert.match(runtime, /normalized === "wgb" \|\| normalized === "wgb02" \|\| normalized === "prado" \|\| normalized === "fabricio"/);
  assert.match(runtime, /key === "prado"\) return "App Prado"/);
  assert.match(runtime, /key === "fabricio"\) return "App Fabricio"/);
  assert.match(runtime, /META_LMS_PRADO_SECRET/);
  assert.match(runtime, /META_LMS_FABRICIO_SECRET/);
  assert.match(wrangler, /"META_LMS_PRADO_ID": "2164806411056665"/);
  assert.match(wrangler, /"META_LMS_FABRICIO_ID": "2906010513107014"/);
  assert.doesNotMatch(wrangler, /META_LMS_PRADO_SECRET/);
  assert.doesNotMatch(wrangler, /META_LMS_FABRICIO_SECRET/);
  assert.match(ui, /"wgb" \| "wgb02" \| "prado" \| "fabricio"/);
  assert.match(dashboard, /"wgb" === e[\s\S]*"App 01 - WGB"/);
  assert.match(dashboard, /"prado" === e[\s\S]*"App Prado"/);
  assert.match(dashboard, /"fabricio" === e[\s\S]*"App Fabricio"/);
});

test("OAuth e callback continuam centralizados na chave exclusiva do workspace", async () => {
  const [connect, status, queue, callback] = await Promise.all([
    source("app/api/meta/connect/route.ts"),
    source("app/api/meta/status/route.ts"),
    source("app/api/meta/connect-queue/route.ts"),
    source("app/api/meta/callback/route.ts"),
  ]);

  assert.match(connect, /metaAppKeyForWorkspace\(context\.workspaceOwnerUserId/);
  assert.match(status, /metaAppKeysForWorkspace\(ownerUserId/);
  assert.match(queue, /metaAppKeyForWorkspace\(ctx\.workspaceOwnerUserId/);
  assert.match(callback, /metaConfig\(normalizeMetaAppKey\(storedState\.metaAppKey\)\)/);
  assert.match(callback, /metaAppKey: app\.key, metaAppId: app\.appId/);
});

test("workspace Teste reutiliza o app Fabricio com identidade visual propria", async () => {
  const [runtime, ui, dashboard] = await Promise.all([
    source("lib/runtime-env.ts"),
    source("app/components/ConnectQueue.tsx"),
    source("app/components/NexoFlowDashboard.tsx"),
  ]);

  assert.match(runtime, /TESTE_WORKSPACE_OWNER_ID = "2b1be4ed-cf2d-4566-823e-f16f813b3744"/);
  assert.match(runtime, /workspaceOwnerUserId === TESTE_WORKSPACE_OWNER_ID\) return \["teste"\]/);
  assert.match(runtime, /workspaceOwnerUserId === TESTE_WORKSPACE_OWNER_ID\) return "teste"/);
  assert.match(runtime, /key === "teste"\) return "App Teste"/);
  assert.match(runtime, /appKey === "fabricio" \|\| appKey === "teste"/);
  assert.match(ui, /"fabricio" \| "teste"/);
  assert.match(dashboard, /"teste" === e[\s\S]*"App Teste"/);
});
