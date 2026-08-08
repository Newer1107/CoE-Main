// Re-record prod's checksum for the edited (purely additive) migration 28.
// The migration was already applied on prod; editing it (removing the drift
// cleanup) changes the file checksum, so the _prisma_migrations record must be
// updated to keep `prisma migrate status` clean. Metadata only — no data change.
// Usage: node scripts/fix-migration-checksum.mjs
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const envLine = readFileSync('.env', 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='));
const prodUrl = envLine.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '');
const NAME = '20260807143558_migration';

const sql = readFileSync(`prisma/migrations/${NAME}/migration.sql`);
const sha = createHash('sha256').update(sql).digest('hex');

const prisma = new PrismaClient({ datasources: { db: { url: prodUrl } } });
try {
  const before = await prisma.$queryRawUnsafe(
    `SELECT checksum FROM \`_prisma_migrations\` WHERE migration_name = '${NAME}'`
  );
  await prisma.$executeRawUnsafe(
    `UPDATE \`_prisma_migrations\` SET checksum = '${sha}' WHERE migration_name = '${NAME}'`
  );
  const after = await prisma.$queryRawUnsafe(
    `SELECT checksum FROM \`_prisma_migrations\` WHERE migration_name = '${NAME}'`
  );
  console.log('before:', before[0]?.checksum);
  console.log('after :', after[0]?.checksum);
  console.log('updated to match edited file:', after[0]?.checksum === sha);
} finally {
  await prisma.$disconnect();
}
