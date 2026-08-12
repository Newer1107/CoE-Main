/**
 * Assert-based checks for the ERP attendance modules (plan §9).
 * Run: npx tsx --env-file=.env scripts/checks/erp-checks.ts
 * Sections: parser fixtures · circuit breaker · queue claim/dedupe/stale/sweep (dev DB).
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { parseErpOutput, CircuitBreaker, deriveErpUid, reverseErpUid, encryptErpPassword, decryptErpPassword } from '../../src/lib/erp-attendance';
import { claimJobs, reclaimStale, sweepOldJobs } from '../sync-erp-attendance';

let passed = 0;
const ok = (name: string) => {
  passed += 1;
  console.log(`  ✓ ${name}`);
};

function checkUidDerivation() {
  console.log('uid derivation:');
  assert.equal(deriveErpUid('1032241230@tcetmumbai.in'), 'S1032241230');
  assert.equal(deriveErpUid('s1032241230@tcetmumbai.in'), 'S1032241230');
  assert.equal(deriveErpUid('user@gmail.com'), null);
  assert.equal(deriveErpUid(null), null);
  assert.equal(deriveErpUid('tcet.cercd@tcetmumbai.in'), 'STCET.CERCD');
  assert.equal(reverseErpUid('S1032241230'), '1032241230@tcetmumbai.in');
  assert.equal(reverseErpUid('STCET.CERCD'), 'tcet.cercd@tcetmumbai.in');
  assert.equal(reverseErpUid('garbage!'), null);
  const enc = encryptErpPassword('Raunak@12345');
  assert.notEqual(enc, 'Raunak@12345');
  assert.equal(decryptErpPassword(enc), 'Raunak@12345');
  assert.notEqual(encryptErpPassword('a'), encryptErpPassword('a'), 'random IV');
  ok('S-prefix, dedupe, non-TCET null, uid reverse, AES-GCM roundtrip');
}

const GOOD = `OCR: ABC12 conf=0.98
Period Start Date | : | 01/07/2026 | Period End Date | : | 12/08/2026
SrNo | Subject | Subject Type | Present | Total Period | Percentage (%)
1 | Professional Skills IV | PR | 1 | 1 | 100
PR | 3 | 4 | 75
2 | Microprocessor | TH | 11 | 17 | 64.71
PR | 6 | 6 | 100
3 | Indian Constitution | TH | 3 | 5 | 60
4 | Introduction to intelligent Systems | TH | 14 | 20 | 70
PR | 5 | 5 | 100
5 | Theory of Computation | TH | 10 | 18 | 55.56
TU | 4 | 4 | 100
6 | Computer Graphics | TH | 11 | 18 | 61.11
PR | 4 | 4 | 100
7 | Soft Skill & Interpersonal Communication | TH | 8 | 14 | 57.14
Theory | 57 | 92 | 61.96
Practical | 19 | 20 | 95
Tutorial | 4 | 4 | 100
Total | 80 | 116 | 68.97
/tmp/erp/1/attendance.png
OK`;

const GOOD_ISO = `Period: 2025-08-01 To 2025-12-20
1 | Math | TH | 1 | 1 | 100
OK`;

const PERIOD_ONLY = `Period: 2025-08-01 To 2025-12-20
OK`;

const NOTHING = `OK`;

const LOGIN_FORM = `NOT AUTHENTICATED — redo fetch + login`;

const UNKNOWN_SHAPE = `Period: 2025-08-01 To 2025-12-20
1 | SubjectX
OK`;

const EMPTY_NO_DATES = `Period Start Date | : | Period End Date | :
OK`;

const ORPHAN_COMPONENT = `Period: 2025-08-01 To 2025-12-20
PR | 3 | 4 | 75
1 | Math | TH | 1 | 1 | 100
OK`;

function checkParser() {
  console.log('parser fixtures:');
  const good = parseErpOutput(GOOD);
  assert.equal(good.kind, 'OK');
  if (good.kind === 'OK') {
    assert.equal(good.rows.length, 11, 'subject rows + merged component rows');
    // component sub-rows merged into the subject: Microprocessor PR 6/6
    const microPr = good.rows.find((r) => r.subject === 'Microprocessor' && r.type === 'PR');
    assert.deepEqual(microPr, { subject: 'Microprocessor', type: 'PR', present: 6, total: 6, percentage: 100 });
    // Professional Skills IV: PR 1/1 + component PR 3/4 → 4/5 = 80%
    const psiv = good.rows.find((r) => r.subject === 'Professional Skills IV');
    assert.deepEqual(psiv, { subject: 'Professional Skills IV', type: 'PR', present: 4, total: 5, percentage: 80 });
    // type sums reproduce the ERP summary rows exactly
    const sum = (type: string) =>
      good.rows.filter((r) => r.type === type).reduce((a, r) => ({ p: a.p + r.present, t: a.t + r.total }), { p: 0, t: 0 });
    const th = sum('TH');
    assert.deepEqual(th, { p: 57, t: 92 });
    const pr = sum('PR');
    assert.deepEqual(pr, { p: 19, t: 20 });
    const tu = sum('TU');
    assert.deepEqual(tu, { p: 4, t: 4 });
    assert.equal(Math.round((80 / 116) * 10000) / 100, 68.97);
    // summary rows must NOT be stored as subjects
    assert.ok(!good.rows.some((r) => ['Total', 'Theory', 'Practical', 'Tutorial'].includes(r.subject)));
    assert.equal(good.periodStart, '2026-07-01');
    assert.equal(good.periodEnd, '2026-08-12');
  }
  const iso = parseErpOutput(GOOD_ISO);
  assert.equal(iso.kind, 'OK');
  if (iso.kind === 'OK') {
    assert.equal(iso.periodStart, '2025-08-01');
    assert.equal(iso.periodEnd, '2025-12-20');
  }
  assert.equal(parseErpOutput(PERIOD_ONLY).kind, 'EMPTY');
  assert.equal(parseErpOutput(EMPTY_NO_DATES).kind, 'EMPTY', 'bad-captcha empty page (period, no dates, no rows)');
  assert.equal(parseErpOutput(NOTHING).kind, 'NO_RECORD');
  assert.equal(parseErpOutput(LOGIN_FORM).kind, 'LOGIN_FORM');
  assert.equal(parseErpOutput(UNKNOWN_SHAPE).kind, 'UNKNOWN_SHAPE');
  assert.equal(parseErpOutput(ORPHAN_COMPONENT).kind, 'UNKNOWN_SHAPE', 'component before any subject row');
  ok('good/empty/no-record/login-form/unknown-shape/orphan');
}

function checkBreaker() {
  console.log('circuit breaker:');
  let now = 0;
  const b = new CircuitBreaker(3, 10 * 60 * 1000, () => now);
  b.recordFailure();
  b.recordFailure();
  assert.equal(b.isOpen(), false);
  b.recordFailure();
  assert.equal(b.isOpen(), true);
  now = 10 * 60 * 1000 + 1;
  assert.equal(b.isOpen(), false, 'closed after cooldown');
  b.recordSuccess();
  b.recordFailure();
  b.recordFailure();
  assert.equal(b.isOpen(), false, 'reset on success');
  ok('3 fails → open → timeout → reset');
}

async function checkQueue() {
  console.log('queue (dev DB):');
  const prisma = new PrismaClient();
  const uid = `CHECK-${Date.now()}`;
  try {
    const created = await prisma.attendanceSyncJob.createMany({
      data: Array.from({ length: 6 }, () => ({ uid })),
    });
    assert.equal(created.count, 6);

    let ids: number[] = [];
    await prisma.$transaction(async (tx) => {
      ids = await claimJobs(tx, 5, 'checker-1');
    });
    assert.equal(ids.length, 5, 'first claim takes exactly 5');
    let ids2: number[] = [];
    await prisma.$transaction(async (tx) => {
      ids2 = await claimJobs(tx, 5, 'checker-2');
    });
    assert.equal(ids2.length, 1, 'second claimer takes the remainder');
    let ids3: number[] = [];
    await prisma.$transaction(async (tx) => {
      ids3 = await claimJobs(tx, 5, 'checker-3');
    });
    assert.equal(ids3.length, 0, 'no double-claim of RUNNING jobs');
    const running = await prisma.attendanceSyncJob.count({ where: { uid, status: 'RUNNING' } });
    assert.equal(running, 6);
    ok('atomic claim 5/1/0 — no double-claim');

    await prisma.attendanceSyncJob.updateMany({
      where: { uid },
      data: { startedAt: new Date(Date.now() - 11 * 60 * 1000) },
    });
    const reclaimed = await reclaimStale();
    assert.equal(reclaimed, 6);
    ok('stale reclaim RUNNING>10min → FAILED');

    const oldJob = await prisma.attendanceSyncJob.create({
      data: { uid, status: 'FAILED', createdAt: new Date(Date.now() - 8 * 86_400_000), finishedAt: new Date(Date.now() - 49 * 3600_000) },
    });
    const swept = await sweepOldJobs();
    assert.ok(swept >= 1, `sweep removed old + failed-aged jobs (${swept})`);
    const gone = await prisma.attendanceSyncJob.findUnique({ where: { id: oldJob.id } });
    assert.equal(gone, null);
    ok('sweep: jobs >7d + FAILED >48h deleted');
  } finally {
    await prisma.attendanceSyncJob.deleteMany({ where: { uid } });
    await prisma.$disconnect();
  }
}

async function main() {
  checkUidDerivation();
  checkParser();
  checkBreaker();
  await checkQueue();
  console.log(`\nALL CHECKS PASSED (${passed})`);
}

main().catch((err) => {
  console.error('CHECK FAILED:', err.message ?? err);
  process.exit(1);
});
