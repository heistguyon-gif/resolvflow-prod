import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const callbackSource = await readFile(new URL("../app/api/meta/callback/route.ts", import.meta.url), "utf8");
const connectQueueSource = await readFile(new URL("../app/components/ConnectQueue.tsx", import.meta.url), "utf8");
const lifecycleSource = await readFile(new URL("../lib/account-lifecycle.ts", import.meta.url), "utf8");

test("o callback direto devolve o id durÃ¡vel da conta conectada", () => {
  assert.match(callbackSource, /const accountId = await restoreConnectedAccount/);
  assert.match(callbackSource, /"meta", "connected", username, accountId/);
  assert.match(lifecycleSource, /returning\(\{ id: accounts\.id \}\)/);
  assert.match(lifecycleSource, /return connectedAccount\?\.id \|\| id/);
});

test("o retorno do OAuth não abre uma etapa adicional de credenciais", () => {
  assert.doesNotMatch(connectQueueSource, /Complete o acesso/);
  assert.doesNotMatch(connectQueueSource, /Token 2FA/);
  assert.doesNotMatch(connectQueueSource, /saveConnectedAccountCredentials/);
  assert.doesNotMatch(connectQueueSource, /connectedAccountFromOAuth/);
});
