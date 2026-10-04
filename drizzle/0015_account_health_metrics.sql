ALTER TABLE `accounts` ADD `follows_count` integer DEFAULT 0 NOT NULL;
ALTER TABLE `accounts` ADD `media_count` integer DEFAULT 0 NOT NULL;
ALTER TABLE `accounts` ADD `profile_views_30d` integer DEFAULT 0 NOT NULL;
ALTER TABLE `accounts` ADD `new_followers_30d` integer DEFAULT 0 NOT NULL;
