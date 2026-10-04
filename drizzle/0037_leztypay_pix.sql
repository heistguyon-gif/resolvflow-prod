CREATE TABLE `otp_pix_webhook_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`provider_payment_id` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`processed_at` text,
	`last_error` text
);
--> statement-breakpoint
CREATE INDEX `otp_pix_webhook_events_status_received_idx` ON `otp_pix_webhook_events` (`status`,`received_at`);
