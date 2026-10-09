ALTER TABLE `connection_requests` ADD COLUMN `invite_mode` text NOT NULL DEFAULT 'manual';
--> statement-breakpoint
ALTER TABLE `connection_requests` ADD COLUMN `invite_claim_token` text;
--> statement-breakpoint
ALTER TABLE `connection_requests` ADD COLUMN `invite_lease_until` text;
--> statement-breakpoint
ALTER TABLE `connection_requests` ADD COLUMN `invite_attempts` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `connection_requests` ADD COLUMN `invite_last_error` text;
--> statement-breakpoint
CREATE INDEX `connection_requests_invite_agent_idx` ON `connection_requests` (`invite_mode`,`meta_app_key`,`status`,`invite_lease_until`);
--> statement-breakpoint
CREATE TABLE `meta_connection_modes` (
  `account_user_id` text NOT NULL,
  `workspace_owner_user_id` text NOT NULL,
  `mode` text NOT NULL DEFAULT 'standard' CHECK (`mode` IN ('standard', 'bot')),
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`account_user_id`, `workspace_owner_user_id`)
);
--> statement-breakpoint
CREATE TABLE `meta_invite_platform_settings` (
  `key` text PRIMARY KEY NOT NULL CHECK (`key` = 'bot_invite'),
  `enabled` integer NOT NULL DEFAULT 0 CHECK (`enabled` IN (0, 1)),
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
