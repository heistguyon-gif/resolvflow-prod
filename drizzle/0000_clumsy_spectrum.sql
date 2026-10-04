CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`instagram_account_id` text,
	`username` text NOT NULL,
	`display_name` text,
	`player` text DEFAULT 'Sem player' NOT NULL,
	`model` text DEFAULT 'Sem modelo' NOT NULL,
	`group_name` text,
	`niche` text,
	`health_status` text DEFAULT 'Desconhecida' NOT NULL,
	`connection_status` text DEFAULT 'Não verificada' NOT NULL,
	`priority` text DEFAULT 'Normal' NOT NULL,
	`posts_today` integer DEFAULT 0 NOT NULL,
	`queue_count` integer DEFAULT 0 NOT NULL,
	`views_30d` integer DEFAULT 0 NOT NULL,
	`followers_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`notes` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_owner_username_uq` ON `accounts` (`owner_user_id`,`username`);--> statement-breakpoint
CREATE INDEX `accounts_owner_health_idx` ON `accounts` (`owner_user_id`,`health_status`);--> statement-breakpoint
CREATE INDEX `accounts_owner_priority_idx` ON `accounts` (`owner_user_id`,`priority`);--> statement-breakpoint
CREATE TABLE `import_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`file_name` text NOT NULL,
	`source` text DEFAULT 'murphy_csv' NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`rows_read` integer DEFAULT 0 NOT NULL,
	`rows_imported` integer DEFAULT 0 NOT NULL,
	`rows_skipped` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `imports_owner_created_idx` ON `import_runs` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'not_connected' NOT NULL,
	`external_app_id` text,
	`account_count` integer DEFAULT 0 NOT NULL,
	`last_sync_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integrations_owner_provider_uq` ON `integrations` (`owner_user_id`,`provider`);