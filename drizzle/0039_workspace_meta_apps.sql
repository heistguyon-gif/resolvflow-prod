CREATE TABLE `workspace_meta_apps` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_owner_user_id` text NOT NULL,
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
CREATE UNIQUE INDEX `workspace_meta_apps_workspace_uq` ON `workspace_meta_apps` (`workspace_owner_user_id`);
--> statement-breakpoint
CREATE INDEX `workspace_meta_apps_status_idx` ON `workspace_meta_apps` (`status`);
