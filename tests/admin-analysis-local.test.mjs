import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const base = process.env.ADMIN_QA_BASE_URL;
const from = "2026-09-05T00:00:00.000Z";
const to = "2026-10-05T00:00:00.000Z";
const get = async (path, values = {}) => {
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  const response = await fetch(url);
  if (response.status !== 200) assert.fail(`${url.pathname}: HTTP ${response.status} ${await response.text()}`);
  return response.json();
};

test("todas as contas soma workspaces sem cruzar o escopo dos usuários", { skip: !base }, async () => {
  const params = { from, to };
  const [global, alpha, beta] = await Promise.all([
    get("/api/admin/analysis", params),
    get("/api/admin/analysis", { ...params, userId: "qa-user-alpha" }),
    get("/api/admin/analysis", { ...params, userId: "qa-user-beta" }),
  ]);
  assert.equal(alpha.scope.workspaces.length, 2);
  assert.equal(alpha.kpis.posts, 3);
  assert.equal(alpha.kpis.views, 6650);
  assert.equal(alpha.kpis.followers, 22150);
  assert.equal(beta.scope.workspaces.length, 1);
  assert.equal(beta.kpis.posts, 1);
  assert.equal(beta.kpis.views, 1720);
  assert.equal(global.kpis.posts, alpha.kpis.posts + beta.kpis.posts);
  assert.equal(global.kpis.views, alpha.kpis.views + beta.kpis.views);
  assert.equal(global.secondary.connected, 3);
  assert.equal(alpha.secondary.connected, 2);
  assert.equal(global.secondary.campaigns, 5);
});

test("período anterior, falha final e taxa de sucesso seguem o mesmo escopo", { skip: !base }, async () => {
  const alpha = await get("/api/admin/analysis", { from, to, userId: "qa-user-alpha" });
  assert.equal(alpha.kpis.previousPosts, 1);
  assert.equal(alpha.kpis.previousViews, 620);
  assert.equal(alpha.kpis.failedInPeriod, 1);
  assert.equal(alpha.kpis.successRate, 75);
  assert.equal(alpha.alerts.failed, 1);
  assert.equal(alpha.secondary.queue, 2);
  assert.equal(alpha.alerts.overdue, 1);
  assert.equal(alpha.series.find(row => row.bucket === "2026-10-03")?.posts, 2);
  assert.equal(alpha.series.find(row => row.bucket === "2026-10-04")?.posts, 0);
  const narrow = await get("/api/admin/analysis", {
    userId: "qa-user-alpha", from: "2026-10-04T00:00:00.000Z", to: "2026-10-04T23:59:59.999Z",
  });
  assert.equal(narrow.kpis.posts, 0);
  assert.equal(narrow.kpis.successRate, null);
  const boundary = await get("/api/admin/analysis", {
    userId: "qa-user-alpha", from: "2026-08-20T00:00:00.000Z", to: "2026-10-04T00:00:00.000Z",
  });
  assert.equal(boundary.series.length, 46);
  assert.equal(boundary.series.at(-1).bucket, "2026-10-04");
});

test("listas e ranking mantêm isolamento, paginação e vínculo canônico", { skip: !base }, async () => {
  const [profiles, disconnected, campaigns, queue, overdue, ranking] = await Promise.all([
    get("/api/admin/analysis/lists", { userId: "qa-user-alpha", section: "profiles", from, to }),
    get("/api/admin/analysis/lists", { userId: "qa-user-alpha", section: "profiles", status: "disconnected", from, to }),
    get("/api/admin/analysis/lists", { userId: "qa-user-alpha", section: "campaigns", from, to }),
    get("/api/admin/analysis/lists", { userId: "qa-user-alpha", section: "queue", status: "failed", from, to }),
    get("/api/admin/analysis/lists", { userId: "qa-user-alpha", section: "queue", status: "overdue", from, to }),
    get("/api/admin/analysis", { userId: "qa-user-alpha", rankType: "campaigns", ranking: "views", from, to }),
  ]);
  assert.equal(profiles.total, 4);
  assert.equal(profiles.pageSize, 20);
  assert.equal(disconnected.total, 1);
  assert.equal(disconnected.rows[0].username, "vale.criativo");
  assert.equal(disconnected.rows[0].connected, false);
  assert.equal(campaigns.total, 4);
  assert.equal(campaigns.rows.some(row => row.status === "template"), false);
  assert.equal(queue.total, 1);
  assert.equal(queue.rows[0].workspaceName, "QA · Aurora Lab");
  assert.equal(overdue.total, 1);
  assert.equal(overdue.rows[0].id, "qa-post-lab-overdue");
  assert.equal(ranking.ranking.type, "campaigns");
  assert.equal(ranking.ranking.rows[0].views, 5670);
  const empty = await get("/api/admin/analysis/lists", { userId: "qa-user-beta", section: "profiles", page: "2", from, to });
  assert.equal(empty.page, 2);
  assert.equal(empty.rows.length, 0);
});

test("rotas novas exigem autorização admin no servidor", async () => {
  for (const file of ["analysis/route.ts", "analysis/lists/route.ts", "analysis/users/route.ts"]) {
    const source = await readFile(new URL(`../app/api/admin/${file}`, import.meta.url), "utf8");
    assert.match(source, /await requirePlatformAdmin\(request\)/);
    assert.doesNotMatch(source, /tokenCiphertext|passwordHash|secretCiphertext|recoveryEmail/);
  }
});
