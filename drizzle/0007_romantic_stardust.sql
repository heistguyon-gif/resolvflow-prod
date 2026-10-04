ALTER TABLE `scheduled_posts` ADD `media_views` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduled_posts` ADD `media_reach` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduled_posts` ADD `insights_synced_at` text;--> statement-breakpoint
ALTER TABLE `scheduled_posts` ADD `insights_error` text;--> statement-breakpoint
CREATE INDEX `scheduled_posts_insights_idx` ON `scheduled_posts` (`status`,`insights_synced_at`);