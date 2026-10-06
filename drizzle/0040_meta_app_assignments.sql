CREATE TABLE `meta_apps` (
  `id` text PRIMARY KEY NOT NULL,
  `label` text NOT NULL,
  `app_id` text NOT NULL,
  `secret_ciphertext` text NOT NULL,
  `secret_iv` text NOT NULL,
  `graph_version` text NOT NULL,
  `redirect_uri` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `created_by_user_id` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `meta_apps_app_id_idx` ON `meta_apps` (`app_id`);
--> statement-breakpoint
CREATE INDEX `meta_apps_status_idx` ON `meta_apps` (`status`);
--> statement-breakpoint
INSERT INTO `meta_apps` (`id`, `label`, `app_id`, `secret_ciphertext`, `secret_iv`, `graph_version`, `redirect_uri`, `status`, `created_by_user_id`, `created_at`, `updated_at`)
SELECT `id`, `label`, `app_id`, `secret_ciphertext`, `secret_iv`, `graph_version`, `redirect_uri`, `status`, `created_by_user_id`, `created_at`, `updated_at`
FROM `workspace_meta_apps`;
--> statement-breakpoint
CREATE TRIGGER `meta_apps_app_id_no_new_duplicates` BEFORE INSERT ON `meta_apps`
WHEN EXISTS (SELECT 1 FROM `meta_apps` WHERE `app_id` = NEW.`app_id`)
BEGIN SELECT RAISE(ABORT, 'meta_app_id_already_exists'); END;
--> statement-breakpoint
CREATE TABLE `meta_app_assignments` (
  `id` text PRIMARY KEY NOT NULL,
  `meta_app_id` text NOT NULL,
  `account_user_id` text NOT NULL,
  `workspace_owner_user_id` text NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `granted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `revoked_at` text,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meta_app_assignments_target_uq` ON `meta_app_assignments` (`meta_app_id`, `account_user_id`, `workspace_owner_user_id`);
--> statement-breakpoint
CREATE INDEX `meta_app_assignments_user_workspace_idx` ON `meta_app_assignments` (`account_user_id`, `workspace_owner_user_id`, `status`);
--> statement-breakpoint
INSERT INTO `meta_app_assignments` (`id`, `meta_app_id`, `account_user_id`, `workspace_owner_user_id`, `status`, `granted_at`, `updated_at`)
SELECT DISTINCT wma.id || ':' || users.id || ':' || wma.workspace_owner_user_id, wma.id, users.id, wma.workspace_owner_user_id, 'active', wma.created_at, wma.updated_at
FROM `workspace_meta_apps` wma
JOIN `workspace_members` members ON members.workspace_owner_user_id = wma.workspace_owner_user_id AND members.status = 'active'
JOIN `app_users` users ON users.id = members.account_user_id OR (members.account_user_id IS NULL AND lower(users.email) = lower(members.email));
--> statement-breakpoint
CREATE TABLE `meta_app_user_policies` (
  `account_user_id` text NOT NULL,
  `workspace_owner_user_id` text NOT NULL,
  `managed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meta_app_user_policies_target_uq` ON `meta_app_user_policies` (`account_user_id`, `workspace_owner_user_id`);
--> statement-breakpoint
INSERT INTO `meta_app_user_policies` (`account_user_id`, `workspace_owner_user_id`, `managed_at`)
SELECT DISTINCT users.id, wma.workspace_owner_user_id, wma.created_at
FROM `workspace_meta_apps` wma
JOIN `workspace_members` members ON members.workspace_owner_user_id = wma.workspace_owner_user_id AND members.status = 'active'
JOIN `app_users` users ON users.id = members.account_user_id OR (members.account_user_id IS NULL AND lower(users.email) = lower(members.email));
