ALTER TABLE `oauth_states` ADD `operation_id` text;
ALTER TABLE `oauth_states` ADD `redirect_uri` text DEFAULT '';
UPDATE `oauth_states` SET `operation_id` = `owner_user_id` WHERE `operation_id` IS NULL;
UPDATE `oauth_states` SET `redirect_uri` = '' WHERE `redirect_uri` IS NULL;

ALTER TABLE `meta_connections` ADD `meta_app_key` text DEFAULT 'default';
ALTER TABLE `meta_connections` ADD `meta_app_id` text;
UPDATE `meta_connections` SET `meta_app_key` = 'default' WHERE `meta_app_key` IS NULL;
