-- Add isCritical and parentCategoryId to RubicCategory for SIH binary evaluation
ALTER TABLE `rubric_categories` ADD COLUMN `isCritical` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `rubric_categories` ADD COLUMN `parentCategoryId` INT NULL;
CREATE INDEX `rubric_categories_parentCategoryId_idx` ON `rubric_categories`(`parentCategoryId`);
ALTER TABLE `rubric_categories` ADD CONSTRAINT `rubric_categories_parentCategoryId_fkey` FOREIGN KEY (`parentCategoryId`) REFERENCES `rubric_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
