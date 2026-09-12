-- AlterTable: Add automation fields to grants, make postedById nullable
ALTER TABLE `grants` MODIFY `postedById` INTEGER NULL,
    ADD COLUMN `source` VARCHAR(191) NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN `month` VARCHAR(191) NULL;

-- CreateIndex: month and source indexes on grants
CREATE INDEX `grants_month_idx` ON `grants`(`month`);
CREATE INDEX `grants_source_idx` ON `grants`(`source`);

-- CreateTable: AutomationRun
CREATE TABLE `automation_runs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `month` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `grantsFound` INTEGER NOT NULL DEFAULT 0,
    `grantsPublished` INTEGER NOT NULL DEFAULT 0,
    `duplicatesSkipped` INTEGER NOT NULL DEFAULT 0,
    `errors` TEXT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex: month index on automation_runs
CREATE INDEX `automation_runs_month_idx` ON `automation_runs`(`month`);
