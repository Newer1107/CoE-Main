-- AlterTable
ALTER TABLE `EventCoordinator` ADD COLUMN `departmentCode` VARCHAR(32) NULL;

-- CreateIndex
CREATE INDEX `EventCoordinator_eventId_departmentCode_idx` ON `EventCoordinator`(`eventId`, `departmentCode`);

-- CreateIndex
CREATE UNIQUE INDEX `EventCoordinator_eventId_userId_departmentCode_key` ON `EventCoordinator`(`eventId`, `userId`, `departmentCode`);
