-- CreateTable
CREATE TABLE `certificates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `eventId` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `detail` VARCHAR(191) NULL,
    `fileKey` VARCHAR(191) NULL,
    `serial` VARCHAR(191) NOT NULL,
    `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `certificates_serial_key`(`serial`),
    INDEX `certificates_userId_idx`(`userId`),
    UNIQUE INDEX `certificates_userId_eventId_type_key`(`userId`, `eventId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `hackathon_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
