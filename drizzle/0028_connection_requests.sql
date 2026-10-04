CREATE TABLE `connection_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`requested_by_user_id` text NOT NULL,
	`requested_by_email` text NOT NULL,
	`username` text NOT NULL,
	`meta_app_key` text DEFAULT 'default' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invited_at` text,
	`invited_by_email` text,
	`connected_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connection_requests_owner_username_uq` ON `connection_requests` (`owner_user_id`,`username`);
--> statement-breakpoint
CREATE INDEX `connection_requests_status_app_idx` ON `connection_requests` (`status`,`meta_app_key`);
--> statement-breakpoint
CREATE INDEX `connection_requests_owner_status_idx` ON `connection_requests` (`owner_user_id`,`status`);
