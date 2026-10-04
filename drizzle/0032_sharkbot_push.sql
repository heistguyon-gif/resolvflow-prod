CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`account_user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text,
	`last_success_at` text,
	`disabled_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_uq` ON `push_subscriptions` (`endpoint`);
--> statement-breakpoint
CREATE INDEX `push_subscriptions_owner_account_idx` ON `push_subscriptions` (`owner_user_id`,`account_user_id`);
--> statement-breakpoint
CREATE INDEX `push_subscriptions_owner_active_idx` ON `push_subscriptions` (`owner_user_id`,`disabled_at`);
--> statement-breakpoint
CREATE TABLE `sharkbot_push_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`status` text DEFAULT 'sending' NOT NULL,
	`provider_status` integer,
	`error_code` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sharkbot_push_deliveries_event_subscription_uq` ON `sharkbot_push_deliveries` (`event_id`,`subscription_id`);
--> statement-breakpoint
CREATE INDEX `sharkbot_push_deliveries_event_idx` ON `sharkbot_push_deliveries` (`event_id`);
