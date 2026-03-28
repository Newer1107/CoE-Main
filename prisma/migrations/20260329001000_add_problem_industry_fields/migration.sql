-- AlterTable
ALTER TABLE `problems`
    ADD COLUMN `isIndustryProblem` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `industryName` VARCHAR(191) NULL;
