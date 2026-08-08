// Print first problem id for an event. Usage: node --env-file=.env scripts/get-problem-id.mjs <eventId>
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const p = await prisma.problem.findFirst({
  where: { eventId: Number(process.argv[2]) },
  select: { id: true },
});
console.log(p ? p.id : 'NONE');
await prisma.$disconnect();
