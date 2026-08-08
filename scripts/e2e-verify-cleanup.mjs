// E2E helper: verify rubric rows + claim, then clean up all test data.
// Usage: node --env-file=.env scripts/e2e-verify-cleanup.mjs <eventCodingId> <eventHackathonId>
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const codingId = Number(process.argv[2]);
const hackId = Number(process.argv[3]);

const rubricCounts = {};
for (const [label, id] of [['coding', codingId], ['hackathon', hackId]]) {
  rubricCounts[label] = await prisma.rubricCategory.count({ where: { eventId: id } });
}
console.log('rubric_categories:', JSON.stringify(rubricCounts));

const claims = await prisma.claim.findMany({
  where: { problem: { eventId: codingId } },
  select: { id: true, teamName: true, status: true, members: { select: { role: true, user: { select: { uid: true } } } } },
});
console.log('coding event claims:', JSON.stringify(claims, null, 1));

const ok =
  rubricCounts.coding === 3 &&
  rubricCounts.hackathon === 7 &&
  claims.length === 1 &&
  claims[0]?.status === 'SUBMITTED' &&
  claims[0]?.members.length === 1 &&
  claims[0]?.members[0]?.role === 'LEAD';

// Cleanup (delete problems first: cascade removes claims/members/scores)
const delProblems = await prisma.problem.deleteMany({ where: { eventId: { in: [codingId, hackId] } } });
const delEvents = await prisma.hackathonEvent.deleteMany({ where: { id: { in: [codingId, hackId] } } });
const delStudents = await prisma.user.deleteMany({
  where: { email: { in: ['e2e.student1@example.test', 'e2e.student2@example.test'] } },
});
console.log(`cleanup: problems=${delProblems.count} events=${delEvents.count} students=${delStudents.count}`);

await prisma.$disconnect();
console.log(ok ? 'E2E VERIFY: PASS' : 'E2E VERIFY: FAIL');
process.exit(ok ? 0 : 1);
