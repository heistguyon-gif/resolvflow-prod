import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { importedTemplateName } from "../lib/imported-template-name.ts";

test("o nome do template trazido identifica a outra conta e cabe no limite", () => {
  assert.equal(importedTemplateName("Manhã fitness · template", "mayk@example.com"), "Manhã fitness · mayk@example.com · template");
  assert.equal(importedTemplateName("Campanha", "").endsWith("· template"), true);
  assert.equal(importedTemplateName("x".repeat(200), "conta-longa@example.com").length, 120);
});

test("só o admin copia a campanha para a própria conta, sem fila e sem alterar a origem", async () => {
  const [route, library, dashboard] = await Promise.all([
    readFile(new URL("../app/api/admin/campaign-templates/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/campaign-library.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/NexoFlowDashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /requirePlatformAdmin/);
  assert.match(route, /copyCampaignAsTemplate/);
  assert.doesNotMatch(route, /scheduledPosts/);
  assert.match(library, /status: "template"/);
  assert.match(library, /totalAccounts: 0/);
  assert.match(library, /ownerUserId: targetOwnerUserId/);
  assert.doesNotMatch(library, /update\(campaigns\)/);
  assert.doesNotMatch(library, /scheduledPosts/);
  assert.match(dashboard, /mountAdminCampaignLibrary/);
});
