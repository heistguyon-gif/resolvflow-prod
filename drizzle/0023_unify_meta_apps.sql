CREATE TABLE IF NOT EXISTS `_unify_silos` (
  `silo_id` text PRIMARY KEY NOT NULL,
  `home_id` text NOT NULL
);

INSERT OR IGNORE INTO `_unify_silos` (`silo_id`, `home_id`) VALUES
  ('nexoflow:operation_2', 'nexoflow:lucasbgn.affiliate@gmail.com'),
  ('nexoflow:operation_3', 'nexoflow:lucasbgn.affiliate@gmail.com');

INSERT OR IGNORE INTO `_unify_silos` (`silo_id`, `home_id`)
SELECT `id`, substr(`id`, 1, length(`id`) - 4)
FROM `workspaces`
WHERE `id` LIKE '%:mk1' OR `id` LIKE '%:mk2';

INSERT OR IGNORE INTO `workspaces` (`id`, `name`, `meta_app_key`, `created_by_user_id`, `status`)
SELECT `_unify_silos`.`home_id`, 'resolvflow', 'default', `_unify_silos`.`home_id`, 'active'
FROM `_unify_silos`
WHERE NOT EXISTS (SELECT 1 FROM `workspaces` existing WHERE existing.`id` = `_unify_silos`.`home_id`);

INSERT INTO `workspace_members` (`id`, `workspace_owner_user_id`, `account_user_id`, `email`, `display_name`, `role`, `status`, `invited_by_user_id`)
SELECT lower(hex(randomblob(16))),
  map.`home_id`,
  silo.`account_user_id`,
  silo.`email`,
  silo.`display_name`,
  silo.`role`,
  silo.`status`,
  silo.`invited_by_user_id`
FROM `workspace_members` silo
INNER JOIN `_unify_silos` map ON map.`silo_id` = silo.`workspace_owner_user_id`
WHERE silo.`status` != 'revoked'
  AND NOT EXISTS (
    SELECT 1 FROM `workspace_members` home
    WHERE home.`workspace_owner_user_id` = map.`home_id`
      AND home.`email` = silo.`email`
  );

UPDATE `accounts` SET `instagram_account_id` = (
  SELECT silo.`instagram_account_id`
  FROM `accounts` silo
  INNER JOIN `_unify_silos` map ON map.`silo_id` = silo.`owner_user_id`
  WHERE silo.`username` = `accounts`.`username`
    AND map.`home_id` = `accounts`.`owner_user_id`
    AND silo.`instagram_account_id` IS NOT NULL
  LIMIT 1
)
WHERE `instagram_account_id` IS NULL
  AND `owner_user_id` IN (SELECT `home_id` FROM `_unify_silos`);

UPDATE `scheduled_posts` SET `account_id` = (
  SELECT home.`id`
  FROM `accounts` silo
  INNER JOIN `_unify_silos` map ON map.`silo_id` = silo.`owner_user_id`
  INNER JOIN `accounts` home ON home.`owner_user_id` = map.`home_id` AND home.`username` = silo.`username`
  WHERE silo.`id` = `scheduled_posts`.`account_id`
  LIMIT 1
)
WHERE `account_id` IN (
  SELECT silo.`id` FROM `accounts` silo
  INNER JOIN `_unify_silos` map ON map.`silo_id` = silo.`owner_user_id`
  INNER JOIN `accounts` home ON home.`owner_user_id` = map.`home_id` AND home.`username` = silo.`username`
);

UPDATE `scheduled_posts` SET `connection_id` = (
  SELECT home.`id`
  FROM `meta_connections` silo
  INNER JOIN `_unify_silos` map ON map.`silo_id` = silo.`owner_user_id`
  INNER JOIN `meta_connections` home ON home.`owner_user_id` = map.`home_id` AND home.`instagram_user_id` = silo.`instagram_user_id`
  WHERE silo.`id` = `scheduled_posts`.`connection_id`
  LIMIT 1
)
WHERE `connection_id` IN (
  SELECT silo.`id` FROM `meta_connections` silo
  INNER JOIN `_unify_silos` map ON map.`silo_id` = silo.`owner_user_id`
  INNER JOIN `meta_connections` home ON home.`owner_user_id` = map.`home_id` AND home.`instagram_user_id` = silo.`instagram_user_id`
);

UPDATE `accounts` SET `owner_user_id` = (
  SELECT map.`home_id` FROM `_unify_silos` map WHERE map.`silo_id` = `accounts`.`owner_user_id` LIMIT 1
)
WHERE `owner_user_id` IN (SELECT `silo_id` FROM `_unify_silos`)
  AND `username` NOT IN (
    SELECT `username` FROM (
      SELECT home.`username` FROM `accounts` home
      INNER JOIN `_unify_silos` map ON map.`home_id` = home.`owner_user_id`
    )
  );

UPDATE `meta_connections` SET `owner_user_id` = (
  SELECT map.`home_id` FROM `_unify_silos` map WHERE map.`silo_id` = `meta_connections`.`owner_user_id` LIMIT 1
)
WHERE `owner_user_id` IN (SELECT `silo_id` FROM `_unify_silos`)
  AND `instagram_user_id` NOT IN (
    SELECT `instagram_user_id` FROM (
      SELECT home.`instagram_user_id` FROM `meta_connections` home
      INNER JOIN `_unify_silos` map ON map.`home_id` = home.`owner_user_id`
    )
  );

UPDATE `campaigns` SET `owner_user_id` = (
  SELECT map.`home_id` FROM `_unify_silos` map WHERE map.`silo_id` = `campaigns`.`owner_user_id` LIMIT 1
)
WHERE `owner_user_id` IN (SELECT `silo_id` FROM `_unify_silos`);

UPDATE `campaign_media` SET `owner_user_id` = (
  SELECT map.`home_id` FROM `_unify_silos` map WHERE map.`silo_id` = `campaign_media`.`owner_user_id` LIMIT 1
)
WHERE `owner_user_id` IN (SELECT `silo_id` FROM `_unify_silos`);

UPDATE `scheduled_posts` SET `owner_user_id` = (
  SELECT map.`home_id` FROM `_unify_silos` map WHERE map.`silo_id` = `scheduled_posts`.`owner_user_id` LIMIT 1
)
WHERE `owner_user_id` IN (SELECT `silo_id` FROM `_unify_silos`);

UPDATE `publication_attempts` SET `owner_user_id` = (
  SELECT map.`home_id` FROM `_unify_silos` map WHERE map.`silo_id` = `publication_attempts`.`owner_user_id` LIMIT 1
)
WHERE `owner_user_id` IN (SELECT `silo_id` FROM `_unify_silos`);

UPDATE `import_runs` SET `owner_user_id` = (
  SELECT map.`home_id` FROM `_unify_silos` map WHERE map.`silo_id` = `import_runs`.`owner_user_id` LIMIT 1
)
WHERE `owner_user_id` IN (SELECT `silo_id` FROM `_unify_silos`);

UPDATE `audit_events` SET `owner_user_id` = (
  SELECT map.`home_id` FROM `_unify_silos` map WHERE map.`silo_id` = `audit_events`.`owner_user_id` LIMIT 1
)
WHERE `owner_user_id` IN (SELECT `silo_id` FROM `_unify_silos`);

UPDATE `integrations` SET `owner_user_id` = (
  SELECT map.`home_id` FROM `_unify_silos` map WHERE map.`silo_id` = `integrations`.`owner_user_id` LIMIT 1
)
WHERE `owner_user_id` IN (SELECT `silo_id` FROM `_unify_silos`)
  AND `provider` NOT IN (
    SELECT `provider` FROM (
      SELECT home.`provider` FROM `integrations` home
      INNER JOIN `_unify_silos` map ON map.`home_id` = home.`owner_user_id`
    )
  );

UPDATE `workspaces` SET `status` = 'archived', `updated_at` = CURRENT_TIMESTAMP
WHERE `id` IN (SELECT `silo_id` FROM `_unify_silos`);

UPDATE `workspaces` SET `name` = CASE WHEN `name` IN ('MK 1', 'MK 2', 'MK 3', 'automaçaomk', 'Operação 2') THEN 'resolvflow' ELSE `name` END, `meta_app_key` = 'default'
WHERE `id` IN (SELECT `home_id` FROM `_unify_silos`) AND `status` = 'active';

DROP TABLE `_unify_silos`;
