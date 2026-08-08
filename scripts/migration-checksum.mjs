// Verify Prisma migration checksum method + prep for history fix.
// Usage: node scripts/migration-checksum.mjs
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const envLine = readFileSync('.env', 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='));
const prodUrl = envLine.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '');

const sql = readFileSync('prisma/migrations/20260807143558_migration/migration.sql');
const sha = createHash('sha256').update(sql).digest('hex');
console.log('sha256 of CURRENT migration file:', sha);

const prisma = new PrismaClient({ datasources: { db: { url: prodUrl } } });
try {
  const rec = await prisma.$queryRawUnsafe(
    "SELECT migration_name, checksum, finished_at FROM `_prisma_migrations` WHERE migration_name = '20260807143558_migration'"
  );
  console.log('prod record:', JSON.stringify(rec[0], null, 1));
  console.log('MATCH:', rec[0]?.checksum === sha ? 'YES (sha256 of file bytes is the checksum)' : 'NO');
} finally {
  await prisma.$disconnect();
}
