-- AlterTable
ALTER TABLE `opportunities` ADD COLUMN `showInHub` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `opportunities_showInHub_idx` ON `opportunities`(`showInHub`);

-- Backfill: already-approved hackathon-like rows stay visible in the Hub.
UPDATE `opportunities` SET `showInHub` = TRUE
WHERE `status` = 'APPROVED' AND (
  LOWER(`category`) LIKE '%hackathon%' OR LOWER(`category`) LIKE '%competition%'
  OR LOWER(`category`) LIKE '%contest%' OR LOWER(`category`) LIKE '%ideathon%'
  OR LOWER(`category`) LIKE '%datathon%' OR LOWER(`category`) LIKE '%codefest%'
  OR LOWER(`category`) LIKE '%hackfest%' OR LOWER(`category`) LIKE '%challenge%'
);
