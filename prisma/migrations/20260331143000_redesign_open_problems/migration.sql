-- Drop old models
DROP TABLE IF EXISTS `open_submission_members`;
DROP TABLE IF EXISTS `open_submissions`;

-- Create new StudentProfile table
CREATE TABLE `student_profiles` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `userId` INT NOT NULL,
    `skills` LONGTEXT,
    `experience` LONGTEXT,
    `interests` LONGTEXT,
    `resumeUrl` VARCHAR(191),
    `isComplete` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `student_profiles_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create new ProblemQuestion table
CREATE TABLE `problem_questions` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `problemId` INT NOT NULL,
    `questionText` LONGTEXT NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'TEXT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `problem_questions_problemId_idx`(`problemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create new Application table
CREATE TABLE `applications` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `userId` INT NOT NULL,
    `profileId` INT NOT NULL,
    `problemId` INT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'SUBMITTED',
    `feedback` LONGTEXT,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `applications_userId_problemId_key`(`userId`, `problemId`),
    INDEX `applications_problemId_idx`(`problemId`),
    INDEX `applications_userId_idx`(`userId`),
    INDEX `applications_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create new ApplicationAnswer table
CREATE TABLE `application_answers` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `applicationId` INT NOT NULL,
    `questionId` INT NOT NULL,
    `answerText` LONGTEXT NOT NULL,

    UNIQUE INDEX `application_answers_applicationId_questionId_key`(`applicationId`, `questionId`),
    INDEX `application_answers_applicationId_idx`(`applicationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Add foreign keys
ALTER TABLE `student_profiles` ADD CONSTRAINT `student_profiles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `problem_questions` ADD CONSTRAINT `problem_questions_problemId_fkey` FOREIGN KEY (`problemId`) REFERENCES `problems`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `applications` ADD CONSTRAINT `applications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `applications` ADD CONSTRAINT `applications_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `student_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `applications` ADD CONSTRAINT `applications_problemId_fkey` FOREIGN KEY (`problemId`) REFERENCES `problems`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `application_answers` ADD CONSTRAINT `application_answers_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `application_answers` ADD CONSTRAINT `application_answers_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `problem_questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
