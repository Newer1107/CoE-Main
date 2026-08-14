-- DropIndex
DROP INDEX `rubric_scores_claimId_rubricCategoryId_key` ON `rubric_scores`;

-- AlterTable
ALTER TABLE `claims` ADD COLUMN `venueId` INTEGER NULL;

-- AlterTable
ALTER TABLE `rubric_scores` ADD COLUMN `comment` VARCHAR(1000) NULL,
    ADD COLUMN `round` INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE `venues` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `eventId` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `capacity` INTEGER NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    INDEX `venues_eventId_idx`(`eventId`),
    UNIQUE INDEX `venues_eventId_name_key`(`eventId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `judge_assignments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `eventId` INTEGER NOT NULL,
    `judgeId` INTEGER NOT NULL,
    `venueId` INTEGER NULL,

    INDEX `judge_assignments_eventId_idx`(`eventId`),
    INDEX `judge_assignments_judgeId_idx`(`judgeId`),
    UNIQUE INDEX `judge_assignments_eventId_judgeId_key`(`eventId`, `judgeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `eventId` INTEGER NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `body` TEXT NOT NULL,
    `fileKey` VARCHAR(191) NULL,
    `pinned` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `notices_eventId_idx`(`eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_feedback` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `eventId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `rating` INTEGER NOT NULL,
    `comment` VARCHAR(2000) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `event_feedback_eventId_idx`(`eventId`),
    UNIQUE INDEX `event_feedback_eventId_userId_key`(`eventId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_media` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `eventId` INTEGER NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `fileKey` VARCHAR(191) NOT NULL,
    `caption` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `event_media_eventId_idx`(`eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `rubric_scores_claimId_rubricCategoryId_round_key` ON `rubric_scores`(`claimId`, `rubricCategoryId`, `round`);

-- AddForeignKey
ALTER TABLE `claims` ADD CONSTRAINT `claims_venueId_fkey` FOREIGN KEY (`venueId`) REFERENCES `venues`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `venues` ADD CONSTRAINT `venues_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `hackathon_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `judge_assignments` ADD CONSTRAINT `judge_assignments_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `hackathon_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `judge_assignments` ADD CONSTRAINT `judge_assignments_judgeId_fkey` FOREIGN KEY (`judgeId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `judge_assignments` ADD CONSTRAINT `judge_assignments_venueId_fkey` FOREIGN KEY (`venueId`) REFERENCES `venues`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notices` ADD CONSTRAINT `notices_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `hackathon_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `event_feedback` ADD CONSTRAINT `event_feedback_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `hackathon_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `event_feedback` ADD CONSTRAINT `event_feedback_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `event_media` ADD CONSTRAINT `event_media_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `hackathon_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

