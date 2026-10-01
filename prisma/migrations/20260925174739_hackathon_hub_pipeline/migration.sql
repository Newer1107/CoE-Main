-- AlterTable
ALTER TABLE `opportunities` ADD COLUMN `pageHash` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `hub_sources` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `method` VARCHAR(191) NOT NULL DEFAULT 'PAGE',
    `frequency` VARCHAR(191) NOT NULL DEFAULT 'DAILY',
    `priority` INTEGER NOT NULL DEFAULT 50,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `lastRunAt` DATETIME(3) NULL,
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `hub_sources_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hub_candidates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `url` VARCHAR(512) NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `sourceType` VARCHAR(191) NOT NULL DEFAULT 'OTHER',
    `status` VARCHAR(191) NOT NULL DEFAULT 'DISCOVERED',
    `title` VARCHAR(191) NULL,
    `extracted` JSON NULL,
    `confidence` DOUBLE NULL,
    `pageHash` VARCHAR(191) NULL,
    `error` TEXT NULL,
    `opportunityId` INTEGER NULL,
    `discoveredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `hub_candidates_url_key`(`url`),
    INDEX `hub_candidates_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hub_import_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `source` VARCHAR(191) NOT NULL,
    `discovered` INTEGER NOT NULL DEFAULT 0,
    `inserted` INTEGER NOT NULL DEFAULT 0,
    `updated` INTEGER NOT NULL DEFAULT 0,
    `rejected` INTEGER NOT NULL DEFAULT 0,
    `published` INTEGER NOT NULL DEFAULT 0,
    `errors` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `hub_import_logs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
