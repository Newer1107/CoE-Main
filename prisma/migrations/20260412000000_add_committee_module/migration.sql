-- Add evaluator role
ALTER TABLE `users`
  MODIFY `role` ENUM('ADMIN', 'FACULTY', 'STUDENT', 'EVALUATOR') NOT NULL;

-- Committee events
CREATE TABLE `committee_events` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(191) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `committee_events_isActive_idx`(`isActive`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `committee_tracks` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `eventId` INTEGER NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `room` VARCHAR(191) NULL,

  INDEX `committee_tracks_eventId_idx`(`eventId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `committee_registrations` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `eventId` INTEGER NOT NULL,
  `trackId` INTEGER NOT NULL,
  `userId` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `committee_registrations_eventId_userId_key`(`eventId`, `userId`),
  INDEX `committee_registrations_eventId_idx`(`eventId`),
  INDEX `committee_registrations_trackId_idx`(`trackId`),
  INDEX `committee_registrations_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `committee_rubric_items` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `eventId` INTEGER NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `maxScore` INTEGER NOT NULL,
  `order` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `committee_rubric_items_eventId_order_idx`(`eventId`, `order`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `committee_scores` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `registrationId` INTEGER NOT NULL,
  `rubricItemId` INTEGER NOT NULL,
  `evaluatorId` INTEGER NOT NULL,
  `score` INTEGER NOT NULL,
  `feedback` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `committee_scores_registrationId_rubricItemId_evaluatorId_key`(`registrationId`, `rubricItemId`, `evaluatorId`),
  INDEX `committee_scores_registrationId_idx`(`registrationId`),
  INDEX `committee_scores_rubricItemId_idx`(`rubricItemId`),
  INDEX `committee_scores_evaluatorId_idx`(`evaluatorId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `committee_tracks`
  ADD CONSTRAINT `committee_tracks_eventId_fkey`
  FOREIGN KEY (`eventId`) REFERENCES `committee_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `committee_registrations`
  ADD CONSTRAINT `committee_registrations_eventId_fkey`
  FOREIGN KEY (`eventId`) REFERENCES `committee_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `committee_registrations_trackId_fkey`
  FOREIGN KEY (`trackId`) REFERENCES `committee_tracks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `committee_registrations_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `committee_rubric_items`
  ADD CONSTRAINT `committee_rubric_items_eventId_fkey`
  FOREIGN KEY (`eventId`) REFERENCES `committee_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `committee_scores`
  ADD CONSTRAINT `committee_scores_registrationId_fkey`
  FOREIGN KEY (`registrationId`) REFERENCES `committee_registrations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `committee_scores_rubricItemId_fkey`
  FOREIGN KEY (`rubricItemId`) REFERENCES `committee_rubric_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `committee_scores_evaluatorId_fkey`
  FOREIGN KEY (`evaluatorId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
