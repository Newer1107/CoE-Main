-- CreateTable
CREATE TABLE `problems` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `tags` VARCHAR(191) NULL,
    `mode` ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `status` ENUM('UNCLAIMED', 'CLAIMED', 'SOLVED', 'ARCHIVED') NOT NULL DEFAULT 'UNCLAIMED',
    `createdById` INTEGER NOT NULL,
    `eventId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `problems_createdById_idx`(`createdById`),
    INDEX `problems_eventId_idx`(`eventId`),
    INDEX `problems_status_idx`(`status`),
    INDEX `problems_mode_idx`(`mode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `claims` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `problemId` INTEGER NOT NULL,
    `teamName` VARCHAR(191) NULL,
    `status` ENUM('IN_PROGRESS', 'SUBMITTED', 'ACCEPTED', 'REVISION_REQUESTED', 'REJECTED') NOT NULL DEFAULT 'IN_PROGRESS',
    `submissionUrl` VARCHAR(191) NULL,
    `submissionFileKey` VARCHAR(191) NULL,
    `score` INTEGER NULL,
    `feedback` TEXT NULL,
    `badges` VARCHAR(191) NULL,
    `reminderSent` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `claims_problemId_idx`(`problemId`),
    INDEX `claims_status_idx`(`status`),
    INDEX `claims_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `claim_members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `claimId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'MEMBER',

    INDEX `claim_members_claimId_idx`(`claimId`),
    INDEX `claim_members_userId_idx`(`userId`),
    UNIQUE INDEX `claim_members_claimId_userId_key`(`claimId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hackathon_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `startTime` DATETIME(3) NOT NULL,
    `endTime` DATETIME(3) NOT NULL,
    `status` ENUM('UPCOMING', 'ACTIVE', 'JUDGING', 'CLOSED') NOT NULL DEFAULT 'UPCOMING',
    `createdById` INTEGER NOT NULL,
    `pptFileKey` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `hackathon_events_status_idx`(`status`),
    INDEX `hackathon_events_startTime_idx`(`startTime`),
    INDEX `hackathon_events_endTime_idx`(`endTime`),
    INDEX `hackathon_events_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `problems` ADD CONSTRAINT `problems_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `problems` ADD CONSTRAINT `problems_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `hackathon_events`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `claims` ADD CONSTRAINT `claims_problemId_fkey` FOREIGN KEY (`problemId`) REFERENCES `problems`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `claim_members` ADD CONSTRAINT `claim_members_claimId_fkey` FOREIGN KEY (`claimId`) REFERENCES `claims`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `claim_members` ADD CONSTRAINT `claim_members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hackathon_events` ADD CONSTRAINT `hackathon_events_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
