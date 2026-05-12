-- AlterTable
ALTER TABLE `internship_documents` ADD COLUMN `documentType` ENUM('FILE', 'LINK') NOT NULL DEFAULT 'FILE',
    ADD COLUMN `linkUrl` VARCHAR(191) NULL,
    ADD COLUMN `title` VARCHAR(191) NULL,
    MODIFY `fileUrl` VARCHAR(191) NULL;
