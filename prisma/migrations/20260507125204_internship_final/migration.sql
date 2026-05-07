/*
  Warnings:

  - You are about to drop the column `internshipId` on the `internship_documents` table. All the data in the column will be lost.
  - You are about to drop the column `internshipId` on the `internship_meetings` table. All the data in the column will be lost.
  - You are about to drop the column `internshipId` on the `internship_messages` table. All the data in the column will be lost.
  - You are about to drop the column `internshipId` on the `internship_tasks` table. All the data in the column will be lost.
  - You are about to drop the `internship_applications` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `internship_participants` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `internships` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `problemId` to the `internship_documents` table without a default value. This is not possible if the table is not empty.
  - Added the required column `problemId` to the `internship_meetings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `problemId` to the `internship_messages` table without a default value. This is not possible if the table is not empty.
  - Added the required column `problemId` to the `internship_tasks` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `internship_applications` DROP FOREIGN KEY `internship_applications_industryPartnerId_fkey`;

-- DropForeignKey
ALTER TABLE `internship_applications` DROP FOREIGN KEY `internship_applications_problemStatementId_fkey`;

-- DropForeignKey
ALTER TABLE `internship_applications` DROP FOREIGN KEY `internship_applications_studentId_fkey`;

-- DropForeignKey
ALTER TABLE `internship_documents` DROP FOREIGN KEY `internship_documents_internshipId_fkey`;

-- DropForeignKey
ALTER TABLE `internship_meetings` DROP FOREIGN KEY `internship_meetings_internshipId_fkey`;

-- DropForeignKey
ALTER TABLE `internship_messages` DROP FOREIGN KEY `internship_messages_internshipId_fkey`;

-- DropForeignKey
ALTER TABLE `internship_participants` DROP FOREIGN KEY `internship_participants_internshipId_fkey`;

-- DropForeignKey
ALTER TABLE `internship_participants` DROP FOREIGN KEY `internship_participants_studentId_fkey`;

-- DropForeignKey
ALTER TABLE `internship_tasks` DROP FOREIGN KEY `internship_tasks_internshipId_fkey`;

-- DropForeignKey
ALTER TABLE `internships` DROP FOREIGN KEY `internships_industryPartnerId_fkey`;

-- DropForeignKey
ALTER TABLE `internships` DROP FOREIGN KEY `internships_problemStatementId_fkey`;

-- DropIndex
DROP INDEX `internship_documents_internshipId_createdAt_idx` ON `internship_documents`;

-- DropIndex
DROP INDEX `internship_meetings_internshipId_datetime_idx` ON `internship_meetings`;

-- DropIndex
DROP INDEX `internship_messages_internshipId_createdAt_idx` ON `internship_messages`;

-- DropIndex
DROP INDEX `internship_tasks_internshipId_status_idx` ON `internship_tasks`;

-- AlterTable
ALTER TABLE `internship_documents` DROP COLUMN `internshipId`,
    ADD COLUMN `problemId` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `internship_meetings` DROP COLUMN `internshipId`,
    ADD COLUMN `problemId` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `internship_messages` DROP COLUMN `internshipId`,
    ADD COLUMN `problemId` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `internship_tasks` DROP COLUMN `internshipId`,
    ADD COLUMN `problemId` INTEGER NOT NULL;

-- DropTable
DROP TABLE `internship_applications`;

-- DropTable
DROP TABLE `internship_participants`;

-- DropTable
DROP TABLE `internships`;

-- CreateIndex
CREATE INDEX `internship_documents_problemId_createdAt_idx` ON `internship_documents`(`problemId`, `createdAt`);

-- CreateIndex
CREATE INDEX `internship_meetings_problemId_datetime_idx` ON `internship_meetings`(`problemId`, `datetime`);

-- CreateIndex
CREATE INDEX `internship_messages_problemId_createdAt_idx` ON `internship_messages`(`problemId`, `createdAt`);

-- CreateIndex
CREATE INDEX `internship_tasks_problemId_status_idx` ON `internship_tasks`(`problemId`, `status`);

-- AddForeignKey
ALTER TABLE `internship_tasks` ADD CONSTRAINT `internship_tasks_problemId_fkey` FOREIGN KEY (`problemId`) REFERENCES `problems`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_messages` ADD CONSTRAINT `internship_messages_problemId_fkey` FOREIGN KEY (`problemId`) REFERENCES `problems`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_meetings` ADD CONSTRAINT `internship_meetings_problemId_fkey` FOREIGN KEY (`problemId`) REFERENCES `problems`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_documents` ADD CONSTRAINT `internship_documents_problemId_fkey` FOREIGN KEY (`problemId`) REFERENCES `problems`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
