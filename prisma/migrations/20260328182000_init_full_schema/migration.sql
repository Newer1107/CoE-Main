-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `password` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'FACULTY', 'STUDENT') NOT NULL,
    `uid` VARCHAR(191) NULL,
    `isVerified` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('ACTIVE', 'PENDING', 'REJECTED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `problems` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `tags` VARCHAR(191) NULL,
    `mode` ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `status` ENUM('OPENED', 'CLOSED', 'ARCHIVED') NOT NULL DEFAULT 'CLOSED',
    `createdById` INTEGER NOT NULL,
    `eventId` INTEGER NULL,
    `supportDocumentKey` VARCHAR(191) NULL,
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
    `status` ENUM('IN_PROGRESS', 'SUBMITTED', 'SHORTLISTED', 'ACCEPTED', 'REVISION_REQUESTED', 'REJECTED') NOT NULL DEFAULT 'IN_PROGRESS',
    `submissionUrl` VARCHAR(191) NULL,
    `submissionFileKey` VARCHAR(191) NULL,
    `innovationScore` INTEGER NULL,
    `technicalScore` INTEGER NULL,
    `impactScore` INTEGER NULL,
    `uxScore` INTEGER NULL,
    `executionScore` INTEGER NULL,
    `presentationScore` INTEGER NULL,
    `feasibilityScore` INTEGER NULL,
    `finalScore` INTEGER NULL,
    `score` INTEGER NULL,
    `feedback` TEXT NULL,
    `badges` VARCHAR(191) NULL,
    `isAbsent` BOOLEAN NOT NULL DEFAULT false,
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
CREATE TABLE `open_submissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `problemId` INTEGER NOT NULL,
    `teamName` VARCHAR(191) NULL,
    `teamSize` INTEGER NOT NULL,
    `teamLeadUid` VARCHAR(191) NOT NULL,
    `technicalDocumentKey` VARCHAR(191) NOT NULL,
    `pptFileKey` VARCHAR(191) NOT NULL,
    `status` ENUM('IN_PROGRESS', 'SUBMITTED', 'SHORTLISTED', 'ACCEPTED', 'REVISION_REQUESTED', 'REJECTED') NOT NULL DEFAULT 'SUBMITTED',
    `innovationScore` INTEGER NULL,
    `technicalScore` INTEGER NULL,
    `impactScore` INTEGER NULL,
    `uxScore` INTEGER NULL,
    `executionScore` INTEGER NULL,
    `presentationScore` INTEGER NULL,
    `feasibilityScore` INTEGER NULL,
    `finalScore` INTEGER NULL,
    `score` INTEGER NULL,
    `feedback` TEXT NULL,
    `badges` VARCHAR(191) NULL,
    `resultPublishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `open_submissions_problemId_idx`(`problemId`),
    INDEX `open_submissions_status_idx`(`status`),
    INDEX `open_submissions_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `open_submission_members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `openSubmissionId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'MEMBER',

    INDEX `open_submission_members_openSubmissionId_idx`(`openSubmissionId`),
    INDEX `open_submission_members_userId_idx`(`userId`),
    UNIQUE INDEX `open_submission_members_openSubmissionId_userId_key`(`openSubmissionId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hackathon_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `startTime` DATETIME(3) NOT NULL,
    `endTime` DATETIME(3) NOT NULL,
    `registrationOpen` BOOLEAN NOT NULL DEFAULT true,
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

-- CreateTable
CREATE TABLE `otps` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `otps_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bookings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `studentId` INTEGER NOT NULL,
    `purpose` TEXT NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `timeSlot` VARCHAR(191) NOT NULL,
    `facilities` JSON NOT NULL,
    `lab` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `adminNote` TEXT NULL,
    `reminderSent` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `news_posts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `caption` TEXT NOT NULL,
    `imageKey` VARCHAR(191) NOT NULL,
    `postedById` INTEGER NOT NULL,
    `publishedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `isVisible` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `grants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `issuingBody` VARCHAR(191) NOT NULL,
    `category` ENUM('GOVT_GRANT', 'SCHOLARSHIP', 'RESEARCH_FUND', 'INDUSTRY_GRANT') NOT NULL,
    `description` TEXT NOT NULL,
    `deadline` DATETIME(3) NOT NULL,
    `referenceLink` VARCHAR(191) NULL,
    `attachmentKey` VARCHAR(191) NULL,
    `postedById` INTEGER NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `mode` ENUM('ONLINE', 'OFFLINE', 'HYBRID') NOT NULL,
    `registrationLink` VARCHAR(191) NULL,
    `posterKey` VARCHAR(191) NULL,
    `postedById` INTEGER NOT NULL,
    `isVisible` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `announcements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `text` TEXT NOT NULL,
    `link` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hero_slides` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `caption` TEXT NOT NULL,
    `imageKey` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

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
ALTER TABLE `open_submissions` ADD CONSTRAINT `open_submissions_problemId_fkey` FOREIGN KEY (`problemId`) REFERENCES `problems`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `open_submission_members` ADD CONSTRAINT `open_submission_members_openSubmissionId_fkey` FOREIGN KEY (`openSubmissionId`) REFERENCES `open_submissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `open_submission_members` ADD CONSTRAINT `open_submission_members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hackathon_events` ADD CONSTRAINT `hackathon_events_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `news_posts` ADD CONSTRAINT `news_posts_postedById_fkey` FOREIGN KEY (`postedById`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `grants` ADD CONSTRAINT `grants_postedById_fkey` FOREIGN KEY (`postedById`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_postedById_fkey` FOREIGN KEY (`postedById`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcements` ADD CONSTRAINT `announcements_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

