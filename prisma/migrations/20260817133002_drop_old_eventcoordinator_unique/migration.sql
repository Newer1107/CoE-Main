-- Drop the old single-column unique that blocked dept-scoped coordinators.
-- New combined unique (eventId, userId, departmentCode) already exists from 20260817132006;
-- its leftmost prefix (eventId) satisfies the FK index requirement, so this drop now succeeds.
DROP INDEX `EventCoordinator_eventId_userId_key` ON `EventCoordinator`;
