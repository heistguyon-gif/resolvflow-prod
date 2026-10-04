UPDATE `workspaces` SET `name` = 'MK 3' WHERE `id` = 'nexoflow:lucasbgn.affiliate@gmail.com';
UPDATE `workspaces` SET `name` = 'MK 2', `meta_app_key` = 'operation_2' WHERE `id` = 'nexoflow:operation_2';

INSERT INTO `workspaces` (`id`, `name`, `meta_app_key`, `created_by_user_id`, `status`)
SELECT 'nexoflow:operation_3', 'automaçaomk', 'operation_3', `created_by_user_id`, 'active'
FROM `workspaces`
WHERE `id` = 'nexoflow:operation_2'
AND NOT EXISTS (SELECT 1 FROM `workspaces` WHERE `id` = 'nexoflow:operation_3')
LIMIT 1;

INSERT INTO `workspace_members` (`id`, `workspace_owner_user_id`, `account_user_id`, `email`, `display_name`, `role`, `status`, `invited_by_user_id`)
SELECT lower(hex(randomblob(16))),
  'nexoflow:operation_3',
  `account_user_id`,
  `email`,
  `display_name`,
  'owner',
  'active',
  `account_user_id`
FROM `workspace_members`
WHERE `role` = 'owner'
  AND `status` = 'active'
  AND `workspace_owner_user_id` = 'nexoflow:operation_2'
  AND NOT EXISTS (SELECT 1 FROM `workspace_members` WHERE `workspace_owner_user_id` = 'nexoflow:operation_3');
