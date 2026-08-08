// Delete demo events by id (cascades problems/claims/claimMembers/scores/tickets).
// Usage: node --env-file=.env scripts/delete-events.mjs 16 17 18
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const ids = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n) && n > 0);
if (ids.length === 0) {
  console.log('no ids');
  process.exit(0);
}
// Claim ids belonging to the events (needed to clean tickets whose claim FK
// goes SET NULL when the claim rows cascade away).
const claims = await prisma.claim.findMany({
  where: { problem: { eventId: { in: ids } } },
  select: { id: true },
});
const claimIds = claims.map((c) => c.id);

const tickets = await prisma.ticket.findMany({
  where: { claimId: { in: claimIds } },
  select: { id: true },
});
for (const t of tickets) {
  await prisma.ticketAttendance.deleteMany({ where: { ticketId: t.id } });
}
const delTickets = tickets.length
  ? await prisma.ticket.deleteMany({ where: { id: { in: tickets.map((t) => t.id) } } })
  : { count: 0 };

const delProblems = await prisma.problem.deleteMany({ where: { eventId: { in: ids } } });
const delEvents = await prisma.hackathonEvent.deleteMany({ where: { id: { in: ids } } });
console.log(
  `deleted tickets=${delTickets.count} problems=${delProblems.count} events=${delEvents.count} (claims ${claimIds.length} cascaded)`
);
await prisma.$disconnect();
