ALTER TABLE `users`
MODIFY COLUMN `role` ENUM('ADMIN', 'FACULTY', 'STUDENT', 'INDUSTRY_PARTNER') NOT NULL;

ALTER TABLE `problems`
ADD COLUMN `problemType` ENUM('OPEN', 'INTERNSHIP') NOT NULL DEFAULT 'OPEN',
ADD COLUMN `approvalStatus` ENUM('PENDING_APPROVAL', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'APPROVED';

CREATE INDEX `problems_problemType_idx` ON `problems`(`problemType`);
CREATE INDEX `problems_approvalStatus_idx` ON `problems`(`approvalStatus`);
