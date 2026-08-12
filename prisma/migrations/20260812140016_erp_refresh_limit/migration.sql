-- AlterTable
ALTER TABLE `users` ADD COLUMN `erp_refresh_count` INTEGER NULL,
    ADD COLUMN `erp_refresh_window_start` DATETIME(3) NULL;
