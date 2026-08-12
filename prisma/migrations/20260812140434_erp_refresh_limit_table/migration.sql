/*
  Warnings:

  - You are about to drop the column `erp_refresh_count` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `erp_refresh_window_start` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `users` DROP COLUMN `erp_refresh_count`,
    DROP COLUMN `erp_refresh_window_start`;

-- CreateTable
CREATE TABLE `attendance_refresh_limits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `windowStart` DATETIME(3) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `attendance_refresh_limits_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
