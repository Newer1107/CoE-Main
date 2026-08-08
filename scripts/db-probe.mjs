// Probe a MySQL database's key table counts via Prisma.
// Usage: node scripts/db-probe.mjs <database>
// Reads credentials from .env DATABASE_URL, switches only the database name.
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';

const target = process.argv[2];
if (!target) {
  console.error('usage: node scripts/db-probe.mjs <database>');
  process.exit(1);
}

const envLine = readFileSync('.env', 'utf8')
  .split('\n')
  .find((l) => l.startsWith('DATABASE_URL='));
if (!envLine) throw new Error('DATABASE_URL not found in .env');
const envUrl = envLine.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '');

const url = envUrl.replace(/\/[^/]+$/, `/${target}`);
const prisma = new PrismaClient({ datasources: { db: { url } } });

const TABLES = [
  'users', 'hackathon_events', 'problems', 'claims', 'claim_members',
  'tickets', 'ticket_attendance', 'rubric_categories', 'rubric_scores',
  'opportunities', 'opportunity_interests', 'learning_resources',
  'site_settings', 'departments', 'computers', 'labs',
];

try {
  await prisma.$connect();
  console.log(`CONNECTED to ${target}`);
  for (const t of TABLES) {
    try {
      const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM \`${t}\``);
      console.log(`  ${t.padEnd(24)} = ${rows[0].c}`);
    } catch {
      console.log(`  ${t.padEnd(24)} = (no table)`);
    }
  }
  try {
    const m = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM `_prisma_migrations`');
    console.log(`  ${'_prisma_migrations'.padEnd(24)} = ${m[0].c} rows`);
  } catch {
    console.log(`  ${'_prisma_migrations'.padEnd(24)} = (no table)`);
  }
} finally {
  await prisma.$disconnect();
}
