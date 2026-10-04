CREATE TABLE `workspace_members` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_owner_user_id` text NOT NULL,
	`account_user_id` text,
	`email` text NOT NULL,
	`display_name` text,
	`role` text DEFAULT 'viewer' NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`invited_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_members_workspace_email_uq` ON `workspace_members` (`workspace_owner_user_id`,`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_members_account_user_uq` ON `workspace_members` (`account_user_id`);--> statement-breakpoint
CREATE INDEX `workspace_members_workspace_role_idx` ON `workspace_members` (`workspace_owner_user_id`,`role`);
