-- AlterTable
ALTER TABLE `venues` ADD COLUMN `departmentCode` VARCHAR(32) NULL;

-- CreateIndex
CREATE INDEX `venues_eventId_departmentCode_idx` ON `venues`(`eventId`, `departmentCode`);
