-- Dados fictícios, exclusivos do D1 local da configuração wrangler.top-local.jsonc.
INSERT OR IGNORE INTO app_users (id, email, password_hash, display_name, status, must_change_password)
VALUES
  ('preview-user-wallet', 'carteira@preview.invalid', 'login-disabled', 'Demo · Carteira e PIX', 'active', 1),
  ('preview-user-api', 'apis@preview.invalid', 'login-disabled', 'Demo · APIs próprias', 'active', 1);

INSERT OR IGNORE INTO workspaces (id, name, meta_app_key, status)
VALUES
  ('preview-workspace-wallet', 'Demo · Operação Carteira', 'default', 'active'),
  ('preview-workspace-api', 'Demo · Operação APIs', 'default', 'active');

INSERT OR IGNORE INTO workspace_members
  (id, workspace_owner_user_id, account_user_id, email, display_name, role, status)
VALUES
  ('preview-member-wallet', 'preview-workspace-wallet', 'preview-user-wallet', 'carteira@preview.invalid', 'Demo · Carteira e PIX', 'owner', 'active'),
  ('preview-member-api', 'preview-workspace-api', 'preview-user-api', 'apis@preview.invalid', 'Demo · APIs próprias', 'owner', 'active');

INSERT OR IGNORE INTO otp_wallets (workspace_owner_user_id, balance_cents, billing_mode)
VALUES
  ('preview-workspace-wallet', 12345, 'platform'),
  ('preview-workspace-api', 0, 'supplier');

INSERT OR IGNORE INTO otp_supplier_apis
  (id, workspace_owner_user_id, name, key_ciphertext, key_iv, enabled, is_primary)
VALUES ('preview-api-disabled', 'preview-workspace-api', 'API demonstrativa · desativada', '', '', 0, 0);

INSERT OR IGNORE INTO otp_inbox
  (id, account_user_id, workspace_owner_user_id, order_id, email, status, closed)
VALUES
  ('preview-order-wallet', 'preview-user-wallet', 'preview-workspace-wallet', 'preview-order-wallet', 'exemplo@preview.invalid', 'active', 0),
  ('preview-order-api', 'preview-user-api', 'preview-workspace-api', 'preview-order-api', 'exemplo@preview.invalid', 'active', 0);

INSERT INTO meta_apps (id, label, app_id, secret_ciphertext, secret_iv, graph_version, status)
SELECT id, label, app_id, '', '', 'v26.0', 'disabled' FROM (
  SELECT 'preview-meta-1' AS id, 'Demo · App Meta 1' AS label, '9000000000000001' AS app_id UNION ALL
  SELECT 'preview-meta-2', 'Demo · App Meta 2', '9000000000000002' UNION ALL
  SELECT 'preview-meta-3', 'Demo · App Meta 3', '9000000000000003' UNION ALL
  SELECT 'preview-meta-4', 'Demo · App Meta 4', '9000000000000004' UNION ALL
  SELECT 'preview-meta-5', 'Demo · App Meta 5', '9000000000000005'
) AS demo WHERE NOT EXISTS (SELECT 1 FROM meta_apps WHERE meta_apps.id = demo.id);

INSERT OR IGNORE INTO meta_app_assignments
  (id, meta_app_id, account_user_id, workspace_owner_user_id, status)
VALUES
  ('preview-assignment-1', 'preview-meta-1', 'preview-user-wallet', 'preview-workspace-wallet', 'active'),
  ('preview-assignment-2', 'preview-meta-2', 'preview-user-api', 'preview-workspace-api', 'active');

INSERT OR IGNORE INTO meta_app_user_policies (account_user_id, workspace_owner_user_id)
VALUES
  ('preview-user-wallet', 'preview-workspace-wallet'),
  ('preview-user-api', 'preview-workspace-api');
