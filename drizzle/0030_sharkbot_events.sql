CREATE TABLE `sharkbot_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`event_key` text NOT NULL,
	`event_type` text NOT NULL,
	`external_event_id` text,
	`payment_id` text,
	`status` text,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'BRL' NOT NULL,
	`payer_name` text,
	`product_name` text,
	`bot_name` text,
	`flow_name` text,
	`gateway` text,
	`occurred_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sharkbot_events_owner_key_uq` ON `sharkbot_events` (`owner_user_id`,`event_key`);
--> statement-breakpoint
CREATE INDEX `sharkbot_events_owner_occurred_idx` ON `sharkbot_events` (`owner_user_id`,`occurred_at`);
--> statement-breakpoint
CREATE INDEX `sharkbot_events_owner_type_idx` ON `sharkbot_events` (`owner_user_id`,`event_type`);
