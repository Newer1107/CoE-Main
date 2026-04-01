/*
  Warnings:

  - You are about to alter the column `status` on the `applications` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(5))`.

*/
-- AlterTable
ALTER TABLE `application_answers` MODIFY `answerText` TEXT NOT NULL;

-- AlterTable
ALTER TABLE `applications` MODIFY `status` ENUM('SUBMITTED', 'SELECTED', 'REJECTED') NOT NULL DEFAULT 'SUBMITTED',
    MODIFY `feedback` TEXT NULL;

-- AlterTable
ALTER TABLE `problem_questions` MODIFY `questionText` TEXT NOT NULL;

-- AlterTable
ALTER TABLE `student_profiles` MODIFY `skills` TEXT NULL,
    MODIFY `experience` TEXT NULL,
    MODIFY `interests` TEXT NULL;
