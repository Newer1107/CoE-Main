CREATE TABLE `session_documents` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `claimId` INTEGER NOT NULL,
  `session` INTEGER NOT NULL,
  `documentUrl` VARCHAR(191) NULL,
  `documentKey` VARCHAR(191) NOT NULL,
  `uploadedByUserId` INTEGER NOT NULL,
  `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `session_documents_claimId_session_key`(`claimId`, `session`),
  INDEX `session_documents_claimId_idx`(`claimId`),
  INDEX `session_documents_session_idx`(`session`),
  INDEX `session_documents_uploadedAt_idx`(`uploadedAt`),
  INDEX `session_documents_uploadedByUserId_idx`(`uploadedByUserId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `session_documents`
  ADD CONSTRAINT `session_documents_claimId_fkey`
  FOREIGN KEY (`claimId`) REFERENCES `claims`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `session_documents`
  ADD CONSTRAINT `session_documents_uploadedByUserId_fkey`
  FOREIGN KEY (`uploadedByUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
