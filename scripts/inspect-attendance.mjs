// Inspect ticket attendance anomaly. Usage: node --env-file=.env scripts/inspect-attendance.mjs
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const tickets = await prisma.ticket.findMany({
  select: { id: true, ticketId: true, claimId: true, _count: { select: { attendanceRecords: true } } },
  orderBy: { id: 'desc' },
  take: 10,
});
console.log('tickets:', JSON.stringify(tickets, null, 1));

// sample rows for the newest ticket
const newest = tickets[0];
if (newest) {
  const rows = await prisma.ticketAttendance.findMany({
    where: { ticketId: newest.id },
    select: { id: true, claimMemberId: true, session: true, status: true, userId: true },
    take: 5,
  });
  const distinctMembers = await prisma.ticketAttendance.findMany({
    where: { ticketId: newest.id },
    distinct: ['claimMemberId', 'session'],
    select: { claimMemberId: true, session: true },
  });
  console.log('sample rows:', JSON.stringify(rows));
  console.log('distinct (claimMemberId, session) pairs:', distinctMembers.length);
  const claim = await prisma.claim.findUnique({
    where: { id: newest.claimId ?? 0 },
    select: { id: true, members: { select: { id: true } } },
  });
  console.log('claim members:', JSON.stringify(claim?.members));
}
await prisma.$disconnect();
