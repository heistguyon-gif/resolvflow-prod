CREATE TABLE `workspaces` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `meta_app_key` text NOT NULL DEFAULT 'default',
  `created_by_user_id` text,
  `status` text NOT NULL DEFAULT 'active',
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `workspaces_meta_app_key_idx` ON `workspaces` (`meta_app_key`);

INSERT INTO `workspaces` (`id`, `name`, `meta_app_key`, `created_by_user_id`, `status`)
SELECT `workspace_owner_user_id`,
  CASE WHEN `workspace_owner_user_id` LIKE 'nexoflow:%' THEN 'Operação MK' ELSE 'Operação' END,
  'default',
  `workspace_owner_user_id`,
  'active'
FROM `workspace_members`
WHERE `role` = 'owner' AND `status` = 'active'
GROUP BY `workspace_owner_user_id`;

INSERT INTO `workspaces` (`id`, `name`, `meta_app_key`, `created_by_user_id`, `status`)
SELECT 'nexoflow:operation_2', 'Operação 2', 'operation_2', `workspace_owner_user_id`, 'active'
FROM `workspace_members`
WHERE `role` = 'owner' AND `status` = 'active'
ORDER BY `created_at` ASC
LIMIT 1;

DROP INDEX IF EXISTS `workspace_members_account_user_uq`;
CREATE UNIQUE INDEX IF NOT EXISTS `workspace_members_account_workspace_uq` ON `workspace_members` (`account_user_id`, `workspace_owner_user_id`);

INSERT INTO `workspace_members` (`id`, `workspace_owner_user_id`, `account_user_id`, `email`, `display_name`, `role`, `status`, `invited_by_user_id`)
SELECT lower(hex(randomblob(16))),
  'nexoflow:operation_2',
  `account_user_id`,
  `email`,
  `display_name`,
  'owner',
  'active',
  `account_user_id`
FROM `workspace_members`
WHERE `role` = 'owner'
  AND `status` = 'active'
  AND `workspace_owner_user_id` != 'nexoflow:operation_2'
ORDER BY `created_at` ASC
LIMIT 1;

ALTER TABLE `oauth_states` ADD `meta_app_key` text DEFAULT 'default';
UPDATE `oauth_states` SET `meta_app_key` = 'default' WHERE `meta_app_key` IS NULL;
