CREATE TABLE `industries` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `industries_name_key`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `users`
ADD COLUMN `industryId` INTEGER NULL;

ALTER TABLE `problems`
ADD COLUMN `industryId` INTEGER NULL;

CREATE INDEX `users_industryId_idx` ON `users`(`industryId`);
CREATE INDEX `problems_industryId_idx` ON `problems`(`industryId`);

ALTER TABLE `users`
ADD CONSTRAINT `users_industryId_fkey`
FOREIGN KEY (`industryId`) REFERENCES `industries`(`id`)
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `problems`
ADD CONSTRAINT `problems_industryId_fkey`
FOREIGN KEY (`industryId`) REFERENCES `industries`(`id`)
ON DELETE SET NULL ON UPDATE CASCADE;

-- Data migration: one industry per existing industry partner user.
INSERT INTO `industries` (`name`, `createdAt`, `updatedAt`)
SELECT CONCAT('Industry ', u.id), NOW(3), NOW(3)
FROM `users` u
WHERE u.`role` = 'INDUSTRY_PARTNER';

-- Link existing industry partner users to their generated industry.
UPDATE `users` u
JOIN `industries` i ON i.`name` = CONCAT('Industry ', u.id)
SET u.`industryId` = i.`id`
WHERE u.`role` = 'INDUSTRY_PARTNER';

-- Link existing internship problems to owner's industry.
UPDATE `problems` p
JOIN `users` u ON u.`id` = p.`createdById`
SET p.`industryId` = u.`industryId`
WHERE p.`problemType` = 'INTERNSHIP'
  AND u.`role` = 'INDUSTRY_PARTNER'
  AND u.`industryId` IS NOT NULL;
