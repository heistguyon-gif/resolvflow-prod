ALTER TABLE `push_subscriptions` ADD `notify_new_lead` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD `notify_payment_created` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD `notify_payment_approved` integer DEFAULT 1 NOT NULL;
