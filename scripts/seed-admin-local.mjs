// Local dev helper: idempotent admin seed (no /api/seed, no .env edits).
// Usage: node --env-file=.env scripts/seed-admin-local.mjs
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME;

if (!email || !password || !name) {
  console.error('ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME must be set in .env');
  process.exit(1);
}

const existing = await prisma.user.findUnique({ where: { email } });
if (existing) {
  console.log(`Admin already exists: ${email}`);
} else {
  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      password: hashed,
      role: 'ADMIN',
      isVerified: true,
      status: 'ACTIVE',
    },
  });
  console.log(`Admin seeded: ${email}`);
}

await prisma.$disconnect();
