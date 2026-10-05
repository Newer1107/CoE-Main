-- AlterTable: Add isTentative flag to grants (marks fallback/review-horizon deadlines)
ALTER TABLE `grants` ADD COLUMN `isTentative` BOOLEAN NOT NULL DEFAULT false;
