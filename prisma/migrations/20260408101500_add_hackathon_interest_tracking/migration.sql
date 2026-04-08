-- CreateTable
CREATE TABLE `hackathon_interests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `eventId` INTEGER NOT NULL,
    `hasDetails` BOOLEAN NOT NULL DEFAULT false,
    `teamName` VARCHAR(191) NULL,
    `teamSize` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `hackathon_interests_userId_eventId_key`(`userId`, `eventId`),
    INDEX `hackathon_interests_eventId_hasDetails_idx`(`eventId`, `hasDetails`),
    INDEX `hackathon_interests_eventId_createdAt_idx`(`eventId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `hackathon_interests` ADD CONSTRAINT `hackathon_interests_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hackathon_interests` ADD CONSTRAINT `hackathon_interests_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `hackathon_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
