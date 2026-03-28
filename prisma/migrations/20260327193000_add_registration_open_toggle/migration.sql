-- Add manual registration toggle for hackathon events
ALTER TABLE `hackathon_events`
ADD COLUMN `registrationOpen` BOOLEAN NOT NULL DEFAULT true;
