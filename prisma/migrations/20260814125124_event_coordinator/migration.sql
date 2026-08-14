-- AlterTable
ALTER TABLE `hackathon_events` ADD COLUMN `coordinatorId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `hackathon_events` ADD CONSTRAINT `hackathon_events_coordinatorId_fkey` FOREIGN KEY (`coordinatorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

