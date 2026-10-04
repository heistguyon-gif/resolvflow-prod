CREATE TABLE `otp_supplier_apis` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`key_ciphertext` text NOT NULL,
	`key_iv` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `otp_supplier_apis_workspace_name_uq` ON `otp_supplier_apis` (`workspace_owner_user_id`,`name`);
--> statement-breakpoint
CREATE INDEX `otp_supplier_apis_workspace_enabled_idx` ON `otp_supplier_apis` (`workspace_owner_user_id`,`enabled`);
--> statement-breakpoint
ALTER TABLE `otp_inbox` ADD `supplier_api_id` text REFERENCES otp_supplier_apis(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `otp_inbox_state` ADD `active_supplier_api_id` text REFERENCES otp_supplier_apis(id) ON DELETE SET NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS `otp_inbox_account_order_uq`;
--> statement-breakpoint
CREATE UNIQUE INDEX `otp_inbox_account_api_order_uq` ON `otp_inbox` (`account_user_id`,`supplier_api_id`,`order_id`);
--> statement-breakpoint
CREATE INDEX `otp_inbox_api_status_idx` ON `otp_inbox` (`supplier_api_id`,`status`);
