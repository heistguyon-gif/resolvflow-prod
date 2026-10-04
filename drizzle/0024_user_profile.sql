ALTER TABLE `app_users` ADD `avatar_media_id` text;
ALTER TABLE `app_users` ADD `notify_publish` integer DEFAULT 1 NOT NULL;
ALTER TABLE `app_users` ADD `notify_errors` integer DEFAULT 1 NOT NULL;
ALTER TABLE `app_users` ADD `notify_connections` integer DEFAULT 1 NOT NULL;
