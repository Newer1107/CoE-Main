-- CreateTable
CREATE TABLE `EventCoordinator` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `eventId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EventCoordinator_userId_idx`(`userId`),
    UNIQUE INDEX `EventCoordinator_eventId_userId_key`(`eventId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EventCoordinator` ADD CONSTRAINT `EventCoordinator_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `hackathon_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventCoordinator` ADD CONSTRAINT `EventCoordinator_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: existing single-coordinator assignments become join rows
INSERT INTO `EventCoordinator` (`eventId`, `userId`, `createdAt`)
SELECT `id`, `coordinatorId`, NOW() FROM `HackathonEvent` WHERE `coordinatorId` IS NOT NULL;
