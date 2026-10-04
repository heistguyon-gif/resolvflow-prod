ALTER TABLE `campaigns` ADD `media_count` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE TABLE `campaign_media` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`object_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`public_url` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_media_campaign_order_uq` ON `campaign_media` (`campaign_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `campaign_media_owner_campaign_idx` ON `campaign_media` (`owner_user_id`,`campaign_id`);--> statement-breakpoint
ALTER TABLE `scheduled_posts` ADD `media_item_id` text REFERENCES `campaign_media`(`id`) ON DELETE cascade;--> statement-breakpoint
DROP INDEX `scheduled_posts_campaign_account_uq`;--> statement-breakpoint
CREATE UNIQUE INDEX `scheduled_posts_campaign_account_media_uq` ON `scheduled_posts` (`campaign_id`,`account_id`,`media_item_id`);
