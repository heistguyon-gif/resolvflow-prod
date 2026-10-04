CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`first_failed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`blocked_until` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_attempts_updated_idx` ON `login_attempts` (`updated_at`);