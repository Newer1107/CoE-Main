CREATE TABLE `hackathon_session_upload_locks` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `eventId` INTEGER NOT NULL,
  `session` INTEGER NOT NULL,
  `isOpen` BOOLEAN NOT NULL DEFAULT false,
  `updatedByUserId` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `hackathon_session_upload_locks_eventId_session_key`(`eventId`, `session`),
  INDEX `hackathon_session_upload_locks_eventId_idx`(`eventId`),
  INDEX `hackathon_session_upload_locks_session_idx`(`session`),
  INDEX `hackathon_session_upload_locks_updatedByUserId_idx`(`updatedByUserId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `hackathon_session_upload_locks`
  ADD CONSTRAINT `hackathon_session_upload_locks_eventId_fkey`
  FOREIGN KEY (`eventId`) REFERENCES `hackathon_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `hackathon_session_upload_locks`
  ADD CONSTRAINT `hackathon_session_upload_locks_updatedByUserId_fkey`
  FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `hackathon_session_upload_locks` (`eventId`, `session`, `isOpen`, `createdAt`, `updatedAt`)
SELECT he.id, seq.session, CASE WHEN seq.session = 1 THEN true ELSE false END, NOW(3), NOW(3)
FROM `hackathon_events` he
JOIN (
  SELECT 1 AS session UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL
  SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL
  SELECT 11 UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15 UNION ALL
  SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19 UNION ALL SELECT 20 UNION ALL
  SELECT 21 UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25 UNION ALL
  SELECT 26 UNION ALL SELECT 27 UNION ALL SELECT 28 UNION ALL SELECT 29 UNION ALL SELECT 30
) seq ON seq.session <= he.totalSessions
ON DUPLICATE KEY UPDATE `updatedAt` = VALUES(`updatedAt`);
