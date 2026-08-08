// E2E helper: seed 2 verified test students (idempotent upsert).
// Usage: node --env-file=.env scripts/e2e-seed-students.mjs
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
// UIDs must match the register schema: ^\d{2}-[A-Z]+[A-Z]\d{1,3}-\d{2}$
const STUDENTS = [
  { name: 'E2E Student One', email: 'e2e.student1@example.test', uid: '24-TCTEST001-28' },
  { name: 'E2E Student Two', email: 'e2e.student2@example.test', uid: '24-TCTEST002-28' },
];

for (const s of STUDENTS) {
  const existing = await prisma.user.findUnique({ where: { email: s.email } });
  if (existing) {
    await prisma.user.update({
      where: { email: s.email },
      data: { uid: s.uid, isVerified: true, status: 'ACTIVE', role: 'STUDENT' },
    });
    console.log(`student updated: ${s.email} (uid ${s.uid})`);
    continue;
  }
  const hashed = await bcrypt.hash('E2ePass123!', 12);
  await prisma.user.create({
    data: {
      name: s.name,
      email: s.email,
      password: hashed,
      role: 'STUDENT',
      uid: s.uid,
      isVerified: true,
      status: 'ACTIVE',
    },
  });
  console.log(`student seeded: ${s.email} (uid ${s.uid})`);
}

await prisma.$disconnect();
