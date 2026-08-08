-- AlterTable
ALTER TABLE `hackathon_events` ADD COLUMN `config` JSON NULL,
    ADD COLUMN `departmentId` INTEGER NULL,
    ADD COLUMN `eventType` VARCHAR(191) NOT NULL DEFAULT 'hackathon',
    ADD COLUMN `featured` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `problems` ADD COLUMN `departmentId` INTEGER NULL,
    ADD COLUMN `difficulty` VARCHAR(191) NULL,
    ADD COLUMN `sdgTags` JSON NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `departmentId` INTEGER NULL,
    ADD COLUMN `isCoordinator` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `departments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `hodUserId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `departments_name_key`(`name`),
    UNIQUE INDEX `departments_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `site_settings` (
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `group` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,

    INDEX `site_settings_group_idx`(`group`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rubric_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `eventId` INTEGER NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `weight` INTEGER NOT NULL DEFAULT 10,
    `order` INTEGER NOT NULL DEFAULT 0,

    INDEX `rubric_categories_eventId_idx`(`eventId`),
    UNIQUE INDEX `rubric_categories_eventId_key_key`(`eventId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rubric_scores` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `claimId` INTEGER NOT NULL,
    `rubricCategoryId` INTEGER NOT NULL,
    `score` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `rubric_scores_claimId_idx`(`claimId`),
    INDEX `rubric_scores_rubricCategoryId_idx`(`rubricCategoryId`),
    UNIQUE INDEX `rubric_scores_claimId_rubricCategoryId_key`(`claimId`, `rubricCategoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `problems` ADD CONSTRAINT `problems_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hackathon_events` ADD CONSTRAINT `hackathon_events_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rubric_categories` ADD CONSTRAINT `rubric_categories_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `hackathon_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rubric_scores` ADD CONSTRAINT `rubric_scores_claimId_fkey` FOREIGN KEY (`claimId`) REFERENCES `claims`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rubric_scores` ADD CONSTRAINT `rubric_scores_rubricCategoryId_fkey` FOREIGN KEY (`rubricCategoryId`) REFERENCES `rubric_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
