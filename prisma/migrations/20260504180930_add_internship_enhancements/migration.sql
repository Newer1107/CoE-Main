-- CreateTable
CREATE TABLE `internship_applications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `studentId` INTEGER NOT NULL,
    `industryPartnerId` INTEGER NOT NULL,
    `internshipTitle` VARCHAR(191) NOT NULL,
    `problemStatementId` INTEGER NULL,
    `status` ENUM('APPLIED', 'ACCEPTED', 'REJECTED') NOT NULL DEFAULT 'APPLIED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `internship_applications_industryPartnerId_internshipTitle_idx`(`industryPartnerId`, `internshipTitle`),
    INDEX `internship_applications_internshipTitle_status_idx`(`internshipTitle`, `status`),
    INDEX `internship_applications_problemStatementId_idx`(`problemStatementId`),
    INDEX `internship_applications_studentId_idx`(`studentId`),
    UNIQUE INDEX `internship_applications_studentId_internshipTitle_industryPa_key`(`studentId`, `internshipTitle`, `industryPartnerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internships` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `industryPartnerId` INTEGER NOT NULL,
    `problemStatementId` INTEGER NULL,
    `status` ENUM('ACTIVE', 'COMPLETED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `internships_title_idx`(`title`),
    INDEX `internships_industryPartnerId_status_idx`(`industryPartnerId`, `status`),
    INDEX `internships_problemStatementId_idx`(`problemStatementId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_participants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `internshipId` INTEGER NOT NULL,
    `studentId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `internship_participants_internshipId_idx`(`internshipId`),
    INDEX `internship_participants_studentId_idx`(`studentId`),
    UNIQUE INDEX `internship_participants_internshipId_studentId_key`(`internshipId`, `studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_tasks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `internshipId` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `assignedToId` INTEGER NOT NULL,
    `deadline` DATETIME(3) NULL,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `internship_tasks_internshipId_status_idx`(`internshipId`, `status`),
    INDEX `internship_tasks_assignedToId_status_idx`(`assignedToId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `internshipId` INTEGER NOT NULL,
    `senderId` INTEGER NOT NULL,
    `content` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `internship_messages_internshipId_createdAt_idx`(`internshipId`, `createdAt`),
    INDEX `internship_messages_senderId_idx`(`senderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_meetings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `internshipId` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `datetime` DATETIME(3) NOT NULL,
    `link` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `internship_meetings_internshipId_datetime_idx`(`internshipId`, `datetime`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_documents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `internshipId` INTEGER NOT NULL,
    `fileUrl` VARCHAR(191) NOT NULL,
    `uploadedById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `internship_documents_internshipId_createdAt_idx`(`internshipId`, `createdAt`),
    INDEX `internship_documents_uploadedById_idx`(`uploadedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `type` ENUM('TASK_ASSIGNED', 'MESSAGE_POSTED', 'MEETING_SCHEDULED', 'DOCUMENT_UPLOADED') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `notifications_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `internship_applications` ADD CONSTRAINT `internship_applications_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_applications` ADD CONSTRAINT `internship_applications_industryPartnerId_fkey` FOREIGN KEY (`industryPartnerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_applications` ADD CONSTRAINT `internship_applications_problemStatementId_fkey` FOREIGN KEY (`problemStatementId`) REFERENCES `problems`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internships` ADD CONSTRAINT `internships_industryPartnerId_fkey` FOREIGN KEY (`industryPartnerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internships` ADD CONSTRAINT `internships_problemStatementId_fkey` FOREIGN KEY (`problemStatementId`) REFERENCES `problems`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_participants` ADD CONSTRAINT `internship_participants_internshipId_fkey` FOREIGN KEY (`internshipId`) REFERENCES `internships`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_participants` ADD CONSTRAINT `internship_participants_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_tasks` ADD CONSTRAINT `internship_tasks_internshipId_fkey` FOREIGN KEY (`internshipId`) REFERENCES `internships`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_tasks` ADD CONSTRAINT `internship_tasks_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_messages` ADD CONSTRAINT `internship_messages_internshipId_fkey` FOREIGN KEY (`internshipId`) REFERENCES `internships`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_messages` ADD CONSTRAINT `internship_messages_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_meetings` ADD CONSTRAINT `internship_meetings_internshipId_fkey` FOREIGN KEY (`internshipId`) REFERENCES `internships`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_documents` ADD CONSTRAINT `internship_documents_internshipId_fkey` FOREIGN KEY (`internshipId`) REFERENCES `internships`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_documents` ADD CONSTRAINT `internship_documents_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
