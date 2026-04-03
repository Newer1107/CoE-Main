-- CreateTable
CREATE TABLE `tickets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ticketId` VARCHAR(191) NOT NULL,
    `type` ENUM('FACILITY_BOOKING', 'HACKATHON_SELECTION') NOT NULL,
    `status` ENUM('ACTIVE', 'USED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `userId` INTEGER NOT NULL,
    `bookingId` INTEGER NULL,
    `claimId` INTEGER NULL,
    `title` VARCHAR(191) NOT NULL,
    `subjectName` VARCHAR(191) NOT NULL,
    `scheduledAt` DATETIME(3) NULL,
    `pdfObjectKey` VARCHAR(191) NOT NULL,
    `qrValue` VARCHAR(191) NOT NULL,
    `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `usedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tickets_ticketId_key`(`ticketId`),
    UNIQUE INDEX `tickets_bookingId_key`(`bookingId`),
    INDEX `tickets_userId_status_idx`(`userId`, `status`),
    INDEX `tickets_type_status_idx`(`type`, `status`),
    INDEX `tickets_issuedAt_idx`(`issuedAt`),
    UNIQUE INDEX `tickets_claimId_userId_type_key`(`claimId`, `userId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tickets` ADD CONSTRAINT `tickets_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tickets` ADD CONSTRAINT `tickets_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tickets` ADD CONSTRAINT `tickets_claimId_fkey` FOREIGN KEY (`claimId`) REFERENCES `claims`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
