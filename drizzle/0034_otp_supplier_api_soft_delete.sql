ALTER TABLE `otp_supplier_apis` ADD `deleted_at` text;
--> statement-breakpoint
CREATE INDEX `otp_supplier_apis_workspace_deleted_idx` ON `otp_supplier_apis` (`workspace_owner_user_id`,`deleted_at`);
