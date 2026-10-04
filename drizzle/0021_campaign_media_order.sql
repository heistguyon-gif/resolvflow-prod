ALTER TABLE `campaigns` ADD `media_order` text DEFAULT 'sequential';
UPDATE `campaigns` SET `media_order` = 'sequential' WHERE `media_order` IS NULL;
