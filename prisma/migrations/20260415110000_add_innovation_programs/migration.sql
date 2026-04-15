CREATE TABLE `innovation_programs` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `programType` VARCHAR(191) NOT NULL,
    `venue` VARCHAR(191) NOT NULL,
    `eventDate` DATETIME(3) NOT NULL,
    `startTime` DATETIME(3) NOT NULL,
    `endTime` DATETIME(3) NOT NULL,
    `noticeFileKey` VARCHAR(191) NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `innovation_programs_eventDate_idx`(`eventDate`),
    INDEX `innovation_programs_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `program_interests` (
    `id` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `programId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `program_interests_userId_programId_key`(`userId`, `programId`),
    INDEX `program_interests_programId_createdAt_idx`(`programId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `innovation_programs`
    ADD CONSTRAINT `innovation_programs_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `program_interests`
    ADD CONSTRAINT `program_interests_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `program_interests`
    ADD CONSTRAINT `program_interests_programId_fkey`
    FOREIGN KEY (`programId`) REFERENCES `innovation_programs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
