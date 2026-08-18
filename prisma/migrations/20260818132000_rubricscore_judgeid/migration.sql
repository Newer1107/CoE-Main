-- Add judgeId to rubric_scores for multi-judge averaging in one venue.
-- Binary rubric is 0/1 per judge per question; final score is average across judges per category.
-- judgeId 0 = legacy/system (no judge). Foreign key omitted for 0 sentinel.
ALTER TABLE `rubric_scores` ADD COLUMN `judgeId` INT NOT NULL DEFAULT 0;
CREATE INDEX `rubric_scores_judgeId_idx` ON `rubric_scores`(`judgeId`);
ALTER TABLE `rubric_scores` DROP INDEX `rubric_scores_claimId_rubricCategoryId_round_key`;
ALTER TABLE `rubric_scores` ADD UNIQUE INDEX `rubric_scores_claimId_rubricCategoryId_round_judgeId_key`(`claimId`, `rubricCategoryId`, `round`, `judgeId`);
