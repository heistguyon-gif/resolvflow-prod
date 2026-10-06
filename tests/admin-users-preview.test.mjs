import assert from "node:assert/strict";
import test from "node:test";

const base = process.env.TOP_PREVIEW_BASE_URL;

test("TOP local: criação usa a API administrativa, valida e aparece na busca paginada", { skip: !base }, async () => {
  const prefix = `top-preview-${Date.now()}`;
  const independentEmail = `${prefix}-independent@preview.invalid`;
  const sharedEmail = `${prefix}-shared@preview.invalid`;
  const endpoint = `${base}/api/team`;
  const post = async (body, headers = {}) => {
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const valid = { displayName: `Demo · Novo usuário ${prefix}`, email: independentEmail, password: "Preview12345", workspaceKind: "independent" };

  assert.equal((await post({ ...valid, email: "inválido" })).status, 400);
  assert.equal((await post({ ...valid, password: "fraca" })).status, 400);
  assert.equal((await post({ ...valid, workspaceKind: "unknown" })).status, 400);
  assert.equal((await post({ ...valid, workspaceKind: "shared", role: "owner" })).status, 400);
  assert.equal((await post(valid, { "sec-fetch-site": "cross-site" })).status, 403);

  const independent = await post(valid);
  assert.equal(independent.status, 201);
  assert.equal(independent.body.role, "owner");
  assert.equal(independent.body.workspaceKind, "independent");
  assert.equal((await post(valid)).status, 409);

  const sharedName = `Demo · Membro compartilhado ${prefix}`;
  const shared = await post({ ...valid, displayName: sharedName, email: sharedEmail,
    workspaceKind: "shared", role: "viewer" });
  assert.equal(shared.status, 201);
  assert.equal(shared.body.role, "viewer");

  const listed = await fetch(`${base}/api/admin/users?q=${encodeURIComponent(prefix)}&pageSize=100&page=1`).then((response) => response.json());
  assert.equal(listed.pageSize, 100);
  assert.equal(listed.total, 2);
  const byEmail = new Map(listed.users.map((user) => [user.email, user]));
  assert.equal(byEmail.get(independentEmail)?.mustChangePassword, true);
  assert.equal(byEmail.get(sharedEmail)?.mustChangePassword, true);
  assert.equal(byEmail.get(independentEmail)?.memberships[0]?.role, "owner");
  assert.equal(byEmail.get(sharedEmail)?.memberships[0]?.role, "viewer");
  assert.equal(byEmail.get(sharedEmail)?.memberships[0]?.workspaceOwnerUserId, "local-preview");
  const exactSearchResponse = await fetch(`${base}/api/admin/users?q=${encodeURIComponent(independentEmail)}&pageSize=25`);
  const exactSearch = await exactSearchResponse.json();
  assert.equal(exactSearchResponse.status, 200, JSON.stringify(exactSearch));
  assert.equal(exactSearch.total, 1);
  const nameSearch = await fetch(`${base}/api/admin/users?q=${encodeURIComponent(sharedName)}&pageSize=25`).then((response) => response.json());
  assert.equal(nameSearch.total, 1);
  assert.equal(nameSearch.users[0].id, shared.body.userId);
  assert.equal((await fetch(`${base}/api/admin/users?q=${encodeURIComponent(prefix)}&pageSize=25&page=2`).then((response) => response.json())).users.length, 0);
  const apps = await fetch(`${base}/api/admin/meta-apps`).then((response) => response.json());
  assert.equal(apps.apps.some((app) => app.assignments.some((assignment) => [independent.body.userId, shared.body.userId].includes(assignment.accountUserId))), false);
});
