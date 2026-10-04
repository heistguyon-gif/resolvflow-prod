DROP INDEX `scheduled_posts_campaign_account_media_uq`;--> statement-breakpoint
ALTER TABLE `scheduled_posts` ADD `repeat_index` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduled_posts` ADD `caption_override` text;--> statement-breakpoint
CREATE UNIQUE INDEX `scheduled_posts_campaign_account_media_repeat_uq` ON `scheduled_posts` (`campaign_id`,`account_id`,`media_item_id`,`repeat_index`);--> statement-breakpoint
ALTER TABLE `campaign_media` ADD `purpose` text DEFAULT 'content' NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `cover_media_id` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `hashtags` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `share_to_feed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `distribution_mode` text DEFAULT 'all_accounts' NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `repeat_count` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `stop_at` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `respect_daily_limit` integer DEFAULT true NOT NULL;