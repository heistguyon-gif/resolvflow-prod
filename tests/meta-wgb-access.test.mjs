import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("app Meta da WGB usa bindings proprios sem versionar o segredo", async () => {
  const [runtime, wrangler] = await Promise.all([
    source("lib/runtime-env.ts"),
    source("wrangler.jsonc"),
  ]);

  assert.match(runtime, /META_LMS_WGB_ID/);
  assert.match(runtime, /META_LMS_WGB_SECRET/);
  assert.match(runtime, /META_LMS_WGB02_ID/);
  assert.match(runtime, /META_LMS_WGB02_SECRET/);
  assert.match(runtime, /WGB_WORKSPACE_OWNER_ID = "f84b6f38-6b98-4ab0-bc5a-302aa6657e79"/);
  assert.match(runtime, /\["wgb", "wgb02"\][\s\S]*filter\(\(key\) => metaConfig\(key\)\.configured\)/);
  assert.match(runtime, /workspaceOwnerUserId === WGB_WORKSPACE_OWNER_ID\) return normalized === "wgb02" \? "wgb02" : "wgb"/);
  assert.match(runtime, /normalized === "wgb" \|\| normalized === "wgb02" \|\| normalized === "prado" \|\| normalized === "fabricio"/);
  assert.match(runtime, /key === "wgb"\) return "App 01 - WGB"/);
  assert.match(runtime, /key === "wgb02"\) return "App 02 - WGB"/);
  assert.match(runtime, /appKey === "wgb02"[\s\S]*META_LMS_WGB02_ID[\s\S]*META_LMS_WGB02_SECRET/);
  assert.match(wrangler, /"META_LMS_WGB_ID": "1728223281605200"/);
  assert.doesNotMatch(wrangler, /META_LMS_WGB_SECRET/);
  assert.doesNotMatch(wrangler, /META_LMS_WGB02_SECRET/);
});

test("seletor, OAuth e callback preservam exclusivamente o app WGB", async () => {
  const [connect, status, queue, callback, ui, queueEngine] = await Promise.all([
    source("app/api/meta/connect/route.ts"),
    source("app/api/meta/status/route.ts"),
    source("app/api/meta/connect-queue/route.ts"),
    source("app/api/meta/callback/route.ts"),
    source("app/components/ConnectQueue.tsx"),
    source("lib/queue-engine.ts"),
  ]);

  assert.match(connect, /metaAppKeyForWorkspace\(context\.workspaceOwnerUserId/);
  assert.match(status, /metaAppKeysForWorkspace\(ownerUserId/);
  assert.match(queue, /apps: metaAppKeysForWorkspace\(ctx\.workspaceOwnerUserId, admin\)/);
  assert.match(callback, /metaConfig\(normalizeMetaAppKey\(storedState\.metaAppKey\)\)/);
  assert.match(callback, /metaAppKey: app\.key, metaAppId: app\.appId/);
  assert.match(ui, /"leandro" \| "wgb" \| "wgb02"/);
  assert.match(ui, /setAppChoices\(data\.apps\)/);
  assert.match(ui, /appChoices\.length > 1/);
  assert.match(queueEngine, /decryptToken\(connection\.tokenCiphertext, connection\.tokenIv\)/);
});
