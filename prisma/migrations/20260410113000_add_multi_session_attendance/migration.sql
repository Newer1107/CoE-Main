-- Add multi-session support configuration at event level.
ALTER TABLE `hackathon_events`
  ADD COLUMN `totalSessions` INTEGER NOT NULL DEFAULT 1;

-- Add session and denormalized claim/user references for session-level attendance uniqueness.
ALTER TABLE `ticket_attendance`
  ADD COLUMN `session` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `claimId` INTEGER NULL,
  ADD COLUMN `userId` INTEGER NULL;

-- Backfill claimId/userId from the member roster.
UPDATE `ticket_attendance` ta
JOIN `claim_members` cm ON cm.id = ta.claimMemberId
SET ta.claimId = cm.claimId,
    ta.userId = cm.userId
WHERE ta.claimId IS NULL OR ta.userId IS NULL;

-- Enforce required denormalized columns after backfill.
ALTER TABLE `ticket_attendance`
  MODIFY COLUMN `claimId` INTEGER NOT NULL,
  MODIFY COLUMN `userId` INTEGER NOT NULL;

-- Replace old attendance uniqueness and indexes with session-aware versions.
CREATE UNIQUE INDEX `ticket_attendance_ticketId_claimMemberId_session_key`
  ON `ticket_attendance`(`ticketId`, `claimMemberId`, `session`);
CREATE UNIQUE INDEX `ticket_attendance_userId_claimId_session_key`
  ON `ticket_attendance`(`userId`, `claimId`, `session`);

CREATE INDEX `ticket_attendance_ticketId_session_status_idx`
  ON `ticket_attendance`(`ticketId`, `session`, `status`);
CREATE INDEX `ticket_attendance_claimMemberId_session_status_idx`
  ON `ticket_attendance`(`claimMemberId`, `session`, `status`);
CREATE INDEX `ticket_attendance_claimId_session_status_idx`
  ON `ticket_attendance`(`claimId`, `session`, `status`);

DROP INDEX `ticket_attendance_ticketId_claimMemberId_key` ON `ticket_attendance`;
DROP INDEX `ticket_attendance_ticketId_status_idx` ON `ticket_attendance`;
DROP INDEX `ticket_attendance_claimMemberId_status_idx` ON `ticket_attendance`;

-- Add foreign keys for denormalized references.
ALTER TABLE `ticket_attendance`
  ADD CONSTRAINT `ticket_attendance_claimId_fkey`
  FOREIGN KEY (`claimId`) REFERENCES `claims`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ticket_attendance`
  ADD CONSTRAINT `ticket_attendance_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
