ALTER TABLE `accounts` ADD `login_email` text;
--> statement-breakpoint
ALTER TABLE `accounts` ADD `recovery_email` text;
--> statement-breakpoint
ALTER TABLE `accounts` ADD `phone_number` text;
--> statement-breakpoint
ALTER TABLE `accounts` ADD `two_factor_method` text;
--> statement-breakpoint
ALTER TABLE `accounts` ADD `vault_reference` text;
--> statement-breakpoint
ALTER TABLE `scheduled_posts` ADD `published_permalink` text;
