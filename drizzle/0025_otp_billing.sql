CREATE TABLE `otp_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`price_cents` integer DEFAULT 990 NOT NULL,
	`instacaster_ciphertext` text,
	`instacaster_iv` text,
	`mercado_pago_ciphertext` text,
	`mercado_pago_iv` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `otp_wallets` (
	`workspace_owner_user_id` text PRIMARY KEY NOT NULL,
	`balance_cents` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `otp_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_owner_user_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`type` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`balance_after_cents` integer NOT NULL,
	`ref_id` text,
	`summary` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `otp_ledger_workspace_created_idx` ON `otp_ledger` (`workspace_owner_user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `otp_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_owner_user_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`provider` text DEFAULT 'mercadopago' NOT NULL,
	`provider_payment_id` text,
	`amount_cents` integer NOT NULL,
	`gmail_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`qr_code` text,
	`ticket_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`paid_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `otp_payments_provider_id_uq` ON `otp_payments` (`provider`,`provider_payment_id`);
--> statement-breakpoint
CREATE INDEX `otp_payments_workspace_status_idx` ON `otp_payments` (`workspace_owner_user_id`,`status`);
