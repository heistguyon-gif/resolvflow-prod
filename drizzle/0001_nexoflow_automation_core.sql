CREATE TABLE `meta_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`instagram_user_id` text NOT NULL,
	`username` text NOT NULL,
	`account_type` text,
	`token_ciphertext` text NOT NULL,
	`token_iv` text NOT NULL,
	`token_expires_at` text,
	`scopes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'connected' NOT NULL,
	`publishing_limit_used` integer DEFAULT 0 NOT NULL,
	`publishing_limit_total` integer DEFAULT 100 NOT NULL,
	`last_sync_at` text,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meta_connections_owner_ig_uq` ON `meta_connections` (`owner_user_id`,`instagram_user_id`);--> statement-breakpoint
CREATE INDEX `meta_connections_owner_status_idx` ON `meta_connections` (`owner_user_id`,`status`);--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`return_to` text DEFAULT '/' NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oauth_states_owner_idx` ON `oauth_states` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`media_type` text DEFAULT 'IMAGE' NOT NULL,
	`media_url` text NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`timezone` text DEFAULT 'America/Sao_Paulo' NOT NULL,
	`start_at` text,
	`interval_minutes` integer DEFAULT 5 NOT NULL,
	`total_accounts` integer DEFAULT 0 NOT NULL,
	`published_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `campaigns_owner_status_idx` ON `campaigns` (`owner_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `campaigns_owner_created_idx` ON `campaigns` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `scheduled_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`account_id` text NOT NULL,
	`connection_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`scheduled_for` text NOT NULL,
	`next_attempt_at` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`container_id` text,
	`published_media_id` text,
	`last_error` text,
	`locked_at` text,
	`lock_token` text,
	`published_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `meta_connections`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `scheduled_posts_due_idx` ON `scheduled_posts` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `scheduled_posts_owner_status_idx` ON `scheduled_posts` (`owner_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `scheduled_posts_campaign_idx` ON `scheduled_posts` (`campaign_id`,`scheduled_for`);--> statement-breakpoint
CREATE UNIQUE INDEX `scheduled_posts_campaign_account_uq` ON `scheduled_posts` (`campaign_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `publication_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`scheduled_post_id` text NOT NULL,
	`stage` text NOT NULL,
	`outcome` text NOT NULL,
	`meta_error_code` text,
	`message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`scheduled_post_id`) REFERENCES `scheduled_posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `publication_attempts_post_created_idx` ON `publication_attempts` (`scheduled_post_id`,`created_at`);--> statement-breakpoint
PRAGMA optimize;
