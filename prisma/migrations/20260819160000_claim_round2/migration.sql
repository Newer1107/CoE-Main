-- Add round 2 venue and timing to Claim for phase-based hackathon progression
ALTER TABLE `claims` ADD COLUMN `round2VenueId` INT NULL;
ALTER TABLE `claims` ADD COLUMN `round2PresentationScheduledAt` DATETIME(3) NULL;
CREATE INDEX `claims_round2VenueId_idx` ON `claims`(`round2VenueId`);
ALTER TABLE `claims` ADD CONSTRAINT `claims_round2VenueId_fkey` FOREIGN KEY (`round2VenueId`) REFERENCES `venues`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
