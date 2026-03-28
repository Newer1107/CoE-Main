-- Add rubric and final score fields for hackathon judging
ALTER TABLE `claims`
  ADD COLUMN `innovationScore` INTEGER NULL,
  ADD COLUMN `technicalScore` INTEGER NULL,
  ADD COLUMN `impactScore` INTEGER NULL,
  ADD COLUMN `uxScore` INTEGER NULL,
  ADD COLUMN `executionScore` INTEGER NULL,
  ADD COLUMN `presentationScore` INTEGER NULL,
  ADD COLUMN `feasibilityScore` INTEGER NULL,
  ADD COLUMN `finalScore` INTEGER NULL;
