// List admin/faculty accounts in a database.
// Usage: node scripts/db-admins.mjs <database>
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';

const target = process.argv[2] || 'coe_db_dev';
const envLine = readFileSync('.env', 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='));
const envUrl = envLine.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '');
const url = envUrl.replace(/\/[^/]+$/, `/${target}`);
const prisma = new PrismaClient({ datasources: { db: { url } } });

try {
  const admins = await prisma.$queryRawUnsafe(
    "SELECT id, email, uid, name, role FROM `users` WHERE role IN ('ADMIN','FACULTY') ORDER BY role LIMIT 15"
  );
  console.log(`${target} ADMIN/FACULTY accounts (${admins.length} shown):`);
  for (const a of admins) console.log(`  ${a.role.padEnd(8)} ${String(a.email).padEnd(38)} uid=${a.uid ?? '-'} name=${a.name ?? '-'}`);
  const c = await prisma.$queryRawUnsafe(
    "SELECT role, COUNT(*) AS c FROM `users` GROUP BY role ORDER BY c DESC"
  );
  console.log('role counts:', JSON.stringify(c.map((r) => ({ role: r.role, count: Number(r.c) }))));
} finally {
  await prisma.$disconnect();
}
