ALTER TABLE `otp_settings` ADD `price_priority_cents` integer DEFAULT 250 NOT NULL;
--> statement-breakpoint
ALTER TABLE `otp_settings` ADD `price_rush_cents` integer DEFAULT 300 NOT NULL;
--> statement-breakpoint
ALTER TABLE `otp_settings` ADD `min_deposit_cents` integer DEFAULT 2000 NOT NULL;
--> statement-breakpoint
UPDATE `otp_settings` SET `price_cents` = 200, `price_priority_cents` = 250, `price_rush_cents` = 300, `min_deposit_cents` = 2000 WHERE `id` = 'default';
