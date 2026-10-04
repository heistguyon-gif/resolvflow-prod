ALTER TABLE `campaigns` ADD `caption_variations` text DEFAULT '[]' NOT NULL;
ALTER TABLE `campaign_media` ADD `caption` text DEFAULT '' NOT NULL;
