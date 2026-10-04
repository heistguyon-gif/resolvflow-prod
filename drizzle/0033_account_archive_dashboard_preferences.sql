ALTER TABLE `accounts` ADD `archived_at` text;
--> statement-breakpoint
CREATE INDEX `accounts_owner_archived_idx` ON `accounts` (`owner_user_id`,`archived_at`);
--> statement-breakpoint
CREATE TABLE `dashboard_preferences` (
	`workspace_owner_user_id` text PRIMARY KEY NOT NULL,
	`preferences_json` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
