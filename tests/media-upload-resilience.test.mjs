import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("uploads de campanha podem ser repetidos sem criar um objeto novo", async () => {
  const [dashboard, uploadRoute] = await Promise.all([
    readFile(new URL("../app/components/NexoFlowDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/media/upload/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(dashboard, /async function uploadCampaignMedia/);
  assert.match(dashboard, /n <= 3/);
  assert.match(dashboard, /"x-upload-id": a/);
  assert.match(dashboard, /apÃ³s 3 tentativas/);
  assert.match(uploadRoute, /request\.headers\.get\("x-upload-id"\)/);
  assert.match(uploadRoute, /await bucket\.head\(objectKey\)/);
  assert.match(uploadRoute, /existing\.customMetadata\?\.ownerUserId !== ownerUserId/);
});

test("campo de legenda nova abre vazio e sem texto promocional", async () => {
  const dashboard = await readFile(
    new URL("../app/components/NexoFlowDashboard.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(dashboard, /Nossa conta de 100k caiu/);
  assert.doesNotMatch(dashboard, /Veja a surpresa no perfil/);
});
