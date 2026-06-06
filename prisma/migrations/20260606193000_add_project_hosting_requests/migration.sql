ALTER TABLE `notifications`
    MODIFY COLUMN `type` ENUM('TASK_ASSIGNED', 'MESSAGE_POSTED', 'MEETING_SCHEDULED', 'DOCUMENT_UPLOADED', 'HOSTING_REQUEST') NOT NULL;

CREATE TABLE `hosting_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `studentId` INTEGER NOT NULL,
    `projectName` VARCHAR(191) NOT NULL,
    `projectDescription` TEXT NOT NULL,
    `githubUrl` VARCHAR(191) NOT NULL,
    `projectCategory` VARCHAR(191) NOT NULL,
    `techStack` JSON NOT NULL,
    `databaseRequired` BOOLEAN NOT NULL DEFAULT false,
    `databaseType` ENUM('NONE', 'MYSQL', 'POSTGRESQL', 'MONGODB') NOT NULL DEFAULT 'NONE',
    `preferredSubdomain` VARCHAR(191) NULL,
    `teamMembers` TEXT NULL,
    `facultyMentor` VARCHAR(191) NULL,
    `hostingDuration` VARCHAR(191) NULL,
    `additionalNotes` TEXT NULL,
    `adminRemarks` TEXT NULL,
    `status` ENUM('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED') NOT NULL DEFAULT 'PENDING',
    `reviewedById` INTEGER NULL,
    `reviewedAt` DATETIME(3) NULL,
    `assignedDomain` VARCHAR(191) NULL,
    `coolifyProjectId` VARCHAR(191) NULL,
    `deploymentStatus` VARCHAR(191) NULL,
    `assignedDatabaseCredentials` JSON NULL,
    `hostingExpiryDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `hosting_requests_studentId_createdAt_idx`(`studentId`, `createdAt`),
    INDEX `hosting_requests_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `hosting_requests_reviewedById_idx`(`reviewedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `hosting_request_status_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `hostingRequestId` INTEGER NOT NULL,
    `oldStatus` ENUM('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED') NOT NULL,
    `newStatus` ENUM('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED') NOT NULL,
    `remarks` TEXT NULL,
    `changedById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `hosting_request_status_history_hostingRequestId_createdAt_idx`(`hostingRequestId`, `createdAt`),
    INDEX `hosting_request_status_history_changedById_idx`(`changedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `hosting_requests`
    ADD CONSTRAINT `hosting_requests_studentId_fkey`
        FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `hosting_requests_reviewedById_fkey`
        FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `hosting_request_status_history`
    ADD CONSTRAINT `hosting_request_status_history_hostingRequestId_fkey`
        FOREIGN KEY (`hostingRequestId`) REFERENCES `hosting_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `hosting_request_status_history_changedById_fkey`
        FOREIGN KEY (`changedById`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
