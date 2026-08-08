/**
 * Backfill / re-run certificate issuance for closed hackathon events.
 *
 * Rules (product decisions, 2026-08-08):
 *   - ACHIEVEMENT   → members of the TOP 3 teams only (rank from finalScore)
 *   - PARTICIPATION → every other member with at least one PRESENT attendance row
 *   - Each certificate carries the team's problem statement.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/backfill-certificates.ts [--reset] [eventId ...]
 *   (no args = all CLOSED hackathon events; --reset deletes existing rows + PDFs first)
 */
import { PrismaClient } from '@prisma/client';
import { issueCertificatesForEvent } from '../src/lib/certificate-issuance';
import { deleteFile } from '../src/lib/minio';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const reset = args.includes('--reset');
  const eventIds = args.filter((a) => a !== '--reset').map(Number).filter(Number.isInteger);

  const events = await prisma.hackathonEvent.findMany({
    where: eventIds.length > 0 ? { id: { in: eventIds } } : { status: 'CLOSED' },
    select: { id: true, title: true, config: true },
  });

  if (events.length === 0) {
    console.log('No closed hackathon events to process.');
    return;
  }

  let totalCreated = 0;
  let totalSkipped = 0;
  for (const event of events) {
    if (reset) {
      // Scoped reset: only drop rows the re-run WILL recreate, so a
      // config-disabled event (issueOnAccept=false) never loses its
      // already-issued achievement certificates.
      const issueAchievement = (event.config as { certificates?: { issueOnAccept?: boolean } } | null)
        ?.certificates?.issueOnAccept ?? true;
      const types = issueAchievement ? ['ACHIEVEMENT', 'PARTICIPATION'] : ['PARTICIPATION'];
      const rows = await prisma.certificate.findMany({
        where: { eventId: event.id, type: { in: types } },
        select: { id: true, fileKey: true },
      });
      for (const row of rows) {
        if (row.fileKey) await deleteFile(row.fileKey).catch(() => null);
      }
      await prisma.certificate.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
      if (rows.length > 0) console.log(`--reset: removed ${rows.length} rows for "${event.title}"`);
    }
    const { created, skipped } = await issueCertificatesForEvent(prisma, event.id, {
      onlyMissing: !reset,
    });
    totalCreated += created;
    totalSkipped += skipped;
    console.log(`${event.title}: ${created} created, ${skipped} skipped`);
  }

  console.log(`\nDone: ${totalCreated} created, ${totalSkipped} skipped.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
