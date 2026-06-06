-- AlterTable
ALTER TABLE `applications` MODIFY `profileId` INTEGER NULL;

-- AlterTable
ALTER TABLE `problems` MODIFY `problemType` ENUM('OPEN', 'INTERNSHIP', 'FACULTY_INTERNSHIP') NOT NULL DEFAULT 'OPEN';

-- CreateTable
CREATE TABLE `faculty_profiles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `department` VARCHAR(191) NULL,
    `designation` VARCHAR(191) NULL,
    `expertise` TEXT NULL,
    `resumeUrl` VARCHAR(191) NULL,
    `profileLinks` JSON NULL,
    `isComplete` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `faculty_profiles_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `faculty_profiles` ADD CONSTRAINT `faculty_profiles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
