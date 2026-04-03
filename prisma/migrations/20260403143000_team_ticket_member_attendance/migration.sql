-- Consolidate legacy per-member hackathon tickets into one ticket per claim.
DELETE t
FROM tickets t
JOIN (
  SELECT claimId, MIN(id) AS keepId
  FROM tickets
  WHERE type = 'HACKATHON_SELECTION' AND claimId IS NOT NULL
  GROUP BY claimId
) kept ON kept.claimId = t.claimId
WHERE t.type = 'HACKATHON_SELECTION'
  AND t.claimId IS NOT NULL
  AND t.id <> kept.keepId;

-- Align retained team ticket ownership to the team lead where available.
UPDATE tickets t
JOIN claim_members cm ON cm.claimId = t.claimId AND cm.role = 'LEAD'
SET t.userId = cm.userId
WHERE t.type = 'HACKATHON_SELECTION'
  AND t.claimId IS NOT NULL;

-- Replace old uniqueness with one ticket per claim per type.
CREATE UNIQUE INDEX `tickets_claimId_type_key` ON `tickets`(`claimId`, `type`);
DROP INDEX `tickets_claimId_userId_type_key` ON `tickets`;

-- Create individual attendance tracking rows per ticket member.
CREATE TABLE `ticket_attendance` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `ticketId` INTEGER NOT NULL,
  `claimMemberId` INTEGER NOT NULL,
  `status` ENUM('NOT_PRESENT', 'PRESENT') NOT NULL DEFAULT 'NOT_PRESENT',
  `checkedInAt` DATETIME(3) NULL,
  `checkedInByUserId` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ticket_attendance_ticketId_claimMemberId_key`(`ticketId`, `claimMemberId`),
  INDEX `ticket_attendance_ticketId_status_idx`(`ticketId`, `status`),
  INDEX `ticket_attendance_claimMemberId_status_idx`(`claimMemberId`, `status`),
  INDEX `ticket_attendance_checkedInByUserId_idx`(`checkedInByUserId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ticket_attendance`
  ADD CONSTRAINT `ticket_attendance_ticketId_fkey`
  FOREIGN KEY (`ticketId`) REFERENCES `tickets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ticket_attendance`
  ADD CONSTRAINT `ticket_attendance_claimMemberId_fkey`
  FOREIGN KEY (`claimMemberId`) REFERENCES `claim_members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ticket_attendance`
  ADD CONSTRAINT `ticket_attendance_checkedInByUserId_fkey`
  FOREIGN KEY (`checkedInByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill attendance entries for all existing hackathon team tickets.
INSERT IGNORE INTO `ticket_attendance` (`ticketId`, `claimMemberId`, `status`, `createdAt`, `updatedAt`)
SELECT t.id, cm.id, 'NOT_PRESENT', NOW(3), NOW(3)
FROM tickets t
JOIN claim_members cm ON cm.claimId = t.claimId
WHERE t.type = 'HACKATHON_SELECTION'
  AND t.claimId IS NOT NULL;
