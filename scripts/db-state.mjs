// DB state check. Usage: node --env-file=.env scripts/db-state.mjs
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const counts = {
  hackathonEvents: await prisma.hackathonEvent.count(),
  problems: await prisma.problem.count(),
  claims: await prisma.claim.count(),
  users: await prisma.user.count(),
  students: await prisma.user.count({ where: { role: 'STUDENT' } }),
  opportunities: await prisma.opportunity.count().catch(() => 'n/a'),
  learningResources: await prisma.learningResource.count().catch(() => 'n/a'),
  siteSettings: await prisma.siteSetting.count(),
  rubricCategories: await prisma.rubricCategory.count(),
  departments: await prisma.department.count(),
};
console.log(JSON.stringify(counts, null, 1));

const events = await prisma.hackathonEvent.findMany({
  select: { id: true, title: true, eventType: true, status: true, startTime: true, featured: true },
  orderBy: { id: 'desc' },
  take: 8,
});
console.log('recent events:', JSON.stringify(events, null, 1));

await prisma.$disconnect();
