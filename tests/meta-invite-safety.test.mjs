import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a rota automática exige controle e atribuição ativa por registro, sem fallback legado ou conta no cofre", () => {
  const route = source("app/api/meta/connect-queue/route.ts");
  const automatic = route.slice(route.indexOf('if (payload.inviteMode === "automatic")'), route.indexOf('if (payload.inviteMode && payload.inviteMode !== "manual")'));
  assert.match(automatic, /isBotInviteEnabled\(\)/);
  assert.match(automatic, /connectionModeFor\(ctx.accountUserId, ctx.workspaceOwnerUserId\)/);
  assert.match(automatic, /eq\(metaAppAssignments.status, "active"\)/);
  assert.match(automatic, /eq\(metaApps.status, "active"\)/);
  assert.match(automatic, /`workspace:\$\{selected.id\}`/);
  assert.match(automatic, /Atribua um App Meta a esta pessoa antes de convidar com o bot\./);
  assert.match(automatic, /automaticResubmitAction\(existing\?\.status\) !== "reopen"/);
  assert.match(automatic, /inviteAttempts: 0/);
  assert.match(automatic, /Este @ já está na fila/);
  assert.doesNotMatch(automatic, /upsertConnectionRequest|ensureVaultAccount|resolveMetaAppForWorkspace|metaAppKeyForWorkspace/);
  assert.match(route, /eq\(connectionRequests.inviteMode, "manual"\)/g);
  assert.equal((route.match(/eq\(connectionRequests.inviteMode, "manual"\)/g) || []).length, 3);
});

test("bypass público é somente POST do agente e a rota valida Bearer antes do banco", () => {
  const worker = source("worker/index.ts");
  const agent = source("app/api/meta/invite-agent/route.ts");
  assert.match(worker, /pathname === "\/api\/meta\/invite-agent" && method === "POST"/);
  assert.match(worker, /pathname === "\/api\/meta\/invite-agent" && request.method === "POST"/);
  assert.ok(agent.indexOf("secret.length < 32") < agent.indexOf("const db = env.DB"));
  assert.ok(agent.indexOf("equalSecretHash(secret, received)") < agent.indexOf("const db = env.DB"));
  assert.match(agent, /cr\.meta_app_key = \?/);
  assert.match(agent, /meta_app_key = \?/);
});

test("interface mantém OAuth e limita aceite automático ao status invited", () => {
  const ui = source("app/components/ConnectQueue.tsx");
  assert.match(ui, /canBotInvite \? <button/);
  assert.match(ui, /Conectar contas/);
  assert.match(ui, /Convidar com o bot/);
  assert.match(ui, /item.status === "invited" \|\| \(item.inviteMode !== "automatic" && item.status === "pending" && canDirectConnect\)/);
  assert.match(ui, /item.inviteMode !== "automatic" && item.status === "pending"/);
});
