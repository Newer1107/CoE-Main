-- AlterTable
ALTER TABLE `users` ADD COLUMN `erp_password_set_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `attendance_stats` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(191) NOT NULL,
    `value` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `attendance_stats_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
