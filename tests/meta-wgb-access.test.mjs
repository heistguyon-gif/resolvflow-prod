import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { authorizeMetaOauthState, canUseUnattributedOauthState } from "../lib/meta-oauth-authorization.ts";

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
  const [connect, status, queue, callback, resolver, ui, queueEngine] = await Promise.all([
    source("app/api/meta/connect/route.ts"),
    source("app/api/meta/status/route.ts"),
    source("app/api/meta/connect-queue/route.ts"),
    source("app/api/meta/callback/route.ts"),
    source("lib/workspace-meta-apps.ts"),
    source("app/components/ConnectQueue.tsx"),
    source("lib/queue-engine.ts"),
  ]);

  assert.match(connect, /metaAppKeyForWorkspace\(context\.workspaceOwnerUserId/);
  assert.match(status, /metaAppKeysForWorkspace\(ownerUserId/);
  assert.match(queue, /apps: await publicMetaAppsForWorkspace\(/);
  assert.match(queue, /legacy: metaAppKeysForWorkspace\(ctx\.workspaceOwnerUserId, admin\)/);
  assert.match(callback, /authorizeMetaOauthState\(storedState/);
  assert.match(callback, /resolveStored: resolveMetaAppForStoredKey/);
  assert.match(resolver, /if \(!recordId\) return legacyResolved\(key \|\| "default"\)/);
  assert.match(resolver, /const app = metaConfig\(key\)/);
  assert.match(callback, /metaAppKey: app\.key, metaAppId: app\.appId/);
  assert.match(ui, /"leandro" \| "wgb" \| "wgb02"/);
  assert.match(ui, /setAppChoices\(data\.apps\)/);
  assert.match(ui, /appChoices\.length > 1/);
  assert.match(queueEngine, /decryptToken\(connection\.tokenCiphertext, connection\.tokenIv\)/);
});

test("state WGB legado sem ator continua válido somente fora de gestão por atribuições", async () => {
  assert.equal(canUseUnattributedOauthState("wgb", false), true);
  assert.equal(canUseUnattributedOauthState("wgb02", false), true);
  assert.equal(canUseUnattributedOauthState("wgb", true), false);
  assert.equal(canUseUnattributedOauthState("workspace:canonical-app", false), false);
  const legacy = { configured: true, key: "wgb" };
  const state = { initiatedByUserId: null, ownerUserId: "wgb-workspace", metaAppKey: "wgb" };
  const dependencies = (managed) => ({
    isWorkspaceManaged: async () => managed,
    resolveForActor: async () => { throw new Error("state legado não deve depender de ator"); },
    resolveStored: async (key) => key === "wgb" ? legacy : null,
  });
  assert.equal(await authorizeMetaOauthState(state, dependencies(false)), legacy);
  assert.equal(await authorizeMetaOauthState(state, dependencies(true)), null);
});
