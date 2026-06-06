-- AlterTable
ALTER TABLE `applications` MODIFY `profileId` INTEGER NULL;

-- AlterTable
ALTER TABLE `problems` MODIFY `problemType` ENUM('OPEN', 'INTERNSHIP', 'FACULTY_INTERNSHIP') NOT NULL DEFAULT 'OPEN';
