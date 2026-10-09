import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { belongsToDirectoryUser } from "../lib/admin-user-membership.ts";

test("directory finds mixed-case legacy email and never associates a different linked account", () => {
  const route = readFileSync(new URL("../app/api/admin/users/route.ts", import.meta.url), "utf8");
  assert.match(route, /and\(isNull\(workspaceMembers\.accountUserId\), inArray\(sql<string>`lower\(\$\{workspaceMembers\.email\}\)`/);
  assert.match(route, /members\.filter\(\(member\) => belongsToDirectoryUser\(member, user\)\)/);

  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE workspace_members(id TEXT PRIMARY KEY, account_user_id TEXT, email TEXT, workspace_owner_user_id TEXT, status TEXT);
    INSERT INTO workspace_members VALUES
      ('legacy',NULL,'person@example.test','workspace-1','active'),
      ('other-account','user-2','Person@Example.Test','workspace-2','active'),
      ('other-legacy',NULL,'other@example.test','workspace-3','active');`);
  const person = { id: "user-1", email: "Person@Example.Test" };
  const other = { id: "user-2", email: "other@example.test" };
  const prefiltered = db.prepare(`SELECT id, account_user_id AS accountUserId, email, workspace_owner_user_id AS workspaceOwnerUserId
    FROM workspace_members WHERE account_user_id IN (?, ?) OR (account_user_id IS NULL AND lower(email) IN (?, ?))`)
    .all(person.id, other.id, person.email.toLowerCase(), other.email.toLowerCase());
  assert.deepEqual(prefiltered.filter((member) => belongsToDirectoryUser(member, person)).map((member) => member.workspaceOwnerUserId), ["workspace-1"]);
  assert.deepEqual(prefiltered.filter((member) => belongsToDirectoryUser(member, other)).map((member) => member.workspaceOwnerUserId), ["workspace-2", "workspace-3"]);

  const personPage = db.prepare(`SELECT id FROM workspace_members WHERE account_user_id IN (?)
    OR (account_user_id IS NULL AND lower(email) IN (?))`).all(person.id, person.email.toLowerCase());
  assert.deepEqual(personPage.map((member) => member.id), ["legacy"]);
  db.close();
});
