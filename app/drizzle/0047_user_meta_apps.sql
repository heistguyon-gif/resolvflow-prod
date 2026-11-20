-- User-registered Meta apps (panel: Contas > Apps Meta).
-- Reuses meta_apps so OAuth connect/callback, token refresh and publishing resolve
-- user apps exactly like catalog apps (key "workspace:<meta_apps.id>").
-- Additive only: existing rows become origin = 'platform'; no data is rewritten.
ALTER TABLE `meta_apps` ADD COLUMN `origin` text DEFAULT 'platform' NOT NULL;
--> statement-breakpoint
ALTER TABLE `meta_apps` ADD COLUMN `owner_workspace_user_id` text;
--> statement-breakpoint
ALTER TABLE `meta_apps` ADD COLUMN `owner_account_user_id` text;
--> statement-breakpoint
ALTER TABLE `meta_apps` ADD COLUMN `webhook_verify_token_ciphertext` text;
--> statement-breakpoint
ALTER TABLE `meta_apps` ADD COLUMN `webhook_verify_token_iv` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `meta_apps_owner_workspace_idx` ON `meta_apps` (`owner_workspace_user_id`, `status`);
