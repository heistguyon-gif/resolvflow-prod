import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { resolveOtpSupplierMode } from "../lib/otp-mode.ts";

test("modo explícito do workspace prevalece sobre a compatibilidade antiga", () => {
  assert.equal(resolveOtpSupplierMode("supplier", false), true);
  assert.equal(resolveOtpSupplierMode("platform", true), false);
  assert.equal(resolveOtpSupplierMode(null, true), true);
  assert.equal(resolveOtpSupplierMode(undefined, false), false);
});

test("migration adiciona o modo por workspace sem alterar saldo e chaves existentes", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE otp_wallets (
      workspace_owner_user_id TEXT PRIMARY KEY NOT NULL,
      balance_cents INTEGER DEFAULT 0 NOT NULL,
      supplier_ciphertext TEXT,
      supplier_iv TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    INSERT INTO otp_wallets (workspace_owner_user_id, balance_cents, supplier_ciphertext, supplier_iv)
      VALUES ('workspace-1', 4200, 'cipher', 'iv');
  `);
  db.exec(readFileSync(new URL("../drizzle/0036_admin_user_otp_settings.sql", import.meta.url), "utf8"));
  const row = db.prepare("SELECT * FROM otp_wallets WHERE workspace_owner_user_id = 'workspace-1'").get();
  assert.equal(row.balance_cents, 4200);
  assert.equal(row.supplier_ciphertext, "cipher");
  assert.equal(row.billing_mode, null);
  db.prepare("UPDATE otp_wallets SET billing_mode = ? WHERE workspace_owner_user_id = ?").run("supplier", "workspace-1");
  assert.equal(db.prepare("SELECT billing_mode FROM otp_wallets WHERE workspace_owner_user_id = 'workspace-1'").get().billing_mode, "supplier");
});

test("rota administrativa exige admin, valida workspace e só revela segredo sob ação explícita", () => {
  const route = readFileSync(new URL("../app/api/admin/otp/route.ts", import.meta.url), "utf8");
  assert.match(route, /requirePlatformAdmin\(request\)/);
  assert.match(route, /workspaceMembers\.accountUserId/);
  assert.match(route, /workspaceMembers\.workspaceOwnerUserId/);
  assert.match(route, /listWorkspaceSupplierApiSecrets/);
  assert.doesNotMatch(route, /key:\s*api\.key/);
  assert.match(route, /adjustWalletBalance/);
  assert.match(route, /setWorkspaceOtpBillingMode/);
  assert.match(route, /deleteWorkspaceSupplierApi/);
  assert.match(route, /action === "reveal_api"/);
  assert.match(route, /cache-control.*private, no-store/);
  assert.match(route, /admin\.otp_api_reveal/);
});

test("interface do admin oferece modo, saldo e APIs por usuário sem revelar chave salva", () => {
  const component = readFileSync(new URL("../app/components/AdminUserOtpManager.tsx", import.meta.url), "utf8");
  assert.match(component, /Carteira e PIX/);
  assert.match(component, /APIs próprias/);
  assert.match(component, /Adicionar saldo/);
  assert.match(component, /Remover saldo/);
  assert.match(component, /Adicionar API/);
  assert.match(component, /Encerrar e-mails/);
  assert.match(component, /só o superadmin pode revelá-las/);
  assert.match(component, /Ver chave/);
  assert.match(component, /Ocultar chave/);
});
