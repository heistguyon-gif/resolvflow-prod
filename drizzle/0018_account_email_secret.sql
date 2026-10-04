ALTER TABLE `accounts` ADD `email_password_ciphertext` text;
ALTER TABLE `accounts` ADD `email_password_iv` text;
ALTER TABLE `accounts` ADD `email_two_factor` text;
ALTER TABLE `accounts` ADD `lifecycle` text DEFAULT 'ativa';
UPDATE `accounts` SET `lifecycle` = 'ativa' WHERE `lifecycle` IS NULL;
