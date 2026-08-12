-- CreateTable
CREATE TABLE `attendance_snapshots` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `uid` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `present` INTEGER NOT NULL,
    `total` INTEGER NOT NULL,
    `percentage` DOUBLE NOT NULL,
    `periodStart` DATETIME(3) NULL,
    `periodEnd` DATETIME(3) NULL,
    `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `attendance_snapshots_uid_idx`(`uid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_sync_jobs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `uid` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'QUEUED',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` VARCHAR(191) NULL,
    `claimantId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,

    INDEX `attendance_sync_jobs_uid_status_idx`(`uid`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
