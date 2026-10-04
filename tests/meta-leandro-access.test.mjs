import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("app Meta do Leandro usa bindings próprios sem versionar o segredo", async () => {
  const [runtime, wrangler] = await Promise.all([
    source("lib/runtime-env.ts"),
    source("wrangler.jsonc"),
  ]);

  assert.match(runtime, /META_LMS_LEANDRO_ID/);
  assert.match(runtime, /META_LMS_LEANDRO_SECRET/);
  assert.match(runtime, /workspaceOwnerUserId === LEANDRO_WORKSPACE_OWNER_ID\) return \["leandro"\]/);
  assert.match(runtime, /allowLeandro \? \[\.\.\.STANDARD_META_APP_KEYS, "leandro"\]/);
  assert.match(runtime, /normalized === "leandro" && !allowLeandro \? "default" : normalized/);
  assert.match(wrangler, /"META_LMS_LEANDRO_ID": "28461186160208614"/);
  assert.doesNotMatch(wrangler, /META_LMS_LEANDRO_SECRET/);
});

test("conexão, seletor e callback preservam o app associado ao workspace", async () => {
  const [connect, status, queue, callback, ui] = await Promise.all([
    source("app/api/meta/connect/route.ts"),
    source("app/api/meta/status/route.ts"),
    source("app/api/meta/connect-queue/route.ts"),
    source("app/api/meta/callback/route.ts"),
    source("app/components/ConnectQueue.tsx"),
  ]);

  assert.match(connect, /metaAppKeyForWorkspace\(context\.workspaceOwnerUserId,[\s\S]*isPlatformAdminEmail\(context\.email\)/);
  assert.match(status, /publicMetaAppsForWorkspace/);
  assert.match(queue, /apps: await publicMetaAppsForWorkspace/);
  assert.match(queue, /metaAppKeyForWorkspace\(ctx\.workspaceOwnerUserId, payload\.metaAppKey, isPlatformAdminEmail\(ctx\.email\)\)/);
  assert.match(queue, /resolveMetaAppForWorkspace/);
  assert.match(callback, /resolveMetaAppForStoredKey\(storedState\.metaAppKey\)/);
  assert.match(callback, /metaAppKey: app\.key, metaAppId: app\.appId/);
  assert.match(ui, /setAppChoices\(data\.apps\)/);
  assert.match(ui, /appChoices\.map/);
});

test("conectar contas abre somente a escolha do app e segue direto ao OAuth", async () => {
  const [ui, auth] = await Promise.all([
    source("app/components/ConnectQueue.tsx"),
    source("lib/auth.ts"),
  ]);

  assert.match(ui, /<h2 id="connect-direct-title">\{appChoices\.length > 1 \? "Escolha o app" : "Conectar perfil"\}<\/h2>/);
  assert.match(ui, /startConnect\(app\)/);
  assert.match(ui, /\/api\/meta\/connect\?app=/);
  assert.doesNotMatch(ui, /Como conectar\?/);
  assert.doesNotMatch(ui, /Colocar os @/);
  assert.doesNotMatch(ui, /requestConnect/);
  assert.match(auth, /export function canDirectMetaConnect[\s\S]*return Boolean\(normalized\)/);
});

test("gestão de equipe fica exclusiva do admin sem bloquear ações pessoais", async () => {
  const [route, dashboard] = await Promise.all([
    source("app/api/team/route.ts"),
    source("app/components/NexoFlowDashboard.tsx"),
  ]);

  assert.match(route, /const context = await requirePlatformAdmin\(request\);/);
  assert.match(route, /personalAction[\s\S]*requireWorkspaceContext\(request, "viewer"\)[\s\S]*requirePlatformAdmin\(request\)/);
  assert.match(route, /const independentWorkspaces = platformAdmin/);
  assert.match(dashboard, /ha\?\.currentUser\?\.isPlatformAdmin[\s\S]*title: "Equipe"/);
  assert.match(dashboard, /!ha\.currentUser\?\.isPlatformAdmin[\s\S]*"team" === e/);
});

test("configurações de backend e integrações ficam exclusivas do admin", async () => {
  const [dashboard, health, storage, audit, backup, sourceRoute] = await Promise.all([
    source("app/components/NexoFlowDashboard.tsx"),
    source("app/api/system/health/route.ts"),
    source("app/api/system/storage/route.ts"),
    source("app/api/audit/route.ts"),
    source("app/api/system/backup/route.ts"),
    source("app/api/system/source/route.ts"),
  ]);

  assert.match(dashboard, /\("team" === e \|\| "integrations" === e\)/);
  assert.match(dashboard, /ha\?\.currentUser\?\.isPlatformAdmin[\s\S]*title: "Integra/);
  for (const route of [health, storage, audit, backup, sourceRoute]) assert.match(route, /requirePlatformAdmin/);
  assert.match(sourceRoute, /action: "source\.download"/);
});
