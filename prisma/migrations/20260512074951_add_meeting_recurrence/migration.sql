-- AlterTable
ALTER TABLE `internship_meetings` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `recurrenceDay` INTEGER NULL,
    ADD COLUMN `recurrenceInterval` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `recurrenceType` ENUM('NONE', 'WEEKLY') NOT NULL DEFAULT 'NONE';
