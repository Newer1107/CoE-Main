-- AlterTable
ALTER TABLE `claims` ADD COLUMN `derivedInfo` JSON NULL,
    ADD COLUMN `leaderPhone` VARCHAR(20) NULL,
    ADD COLUMN `mentor` VARCHAR(200) NULL;
