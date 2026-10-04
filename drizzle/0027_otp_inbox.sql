CREATE TABLE `otp_inbox` (
	`id` text PRIMARY KEY NOT NULL,
	`account_user_id` text NOT NULL,
	`workspace_owner_user_id` text NOT NULL,
	`order_id` text NOT NULL,
	`email` text NOT NULL,
	`product` text DEFAULT 'ig_gmail_otp' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`price` text DEFAULT '' NOT NULL,
	`codes_json` text DEFAULT '[]' NOT NULL,
	`closed` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `otp_inbox_account_order_uq` ON `otp_inbox` (`account_user_id`,`order_id`);
--> statement-breakpoint
CREATE INDEX `otp_inbox_account_created_idx` ON `otp_inbox` (`account_user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `otp_inbox_state` (
	`account_user_id` text PRIMARY KEY NOT NULL,
	`active_order_id` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
