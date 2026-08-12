/**
 * ERP attendance sync worker.
 * Modes: --drain (single pass, for cron) | --daemon (continuous loop).
 * Claims QUEUED jobs (SKIP LOCKED + claimant stamp → no double-claim across
 * instances), spawns scripts/erp_fetch.py per job with a per-job workdir,
 * writes snapshots transactionally, retries once, circuit-breaks after 3
 * consecutive failures (10 min pause). Kill switch: ATTENDANCE_ENABLED=false.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseErpOutput, CircuitBreaker } from '../src/lib/erp-attendance';

const prisma = new PrismaClient();
const CLAIMANT_ID = `${process.pid}-${Date.now().toString(36)}`;
const CLAIM_BATCH = Math.max(1, Number(process.env.ERP_WORKERS ?? 5) || 5);
const FETCH_TIMEOUT_MS = 90_000;
const RUNNING_STALE_MS = 10 * 60_000;
const RETRY_DELAY_MS = 30_000;
const MIN_START_GAP_MS = 1_000;
const DAEMON_POLL_MS = 3_000;
const BREAKER_PAUSE_MS = 10 * 60_000;
const SWEEP_JOB_AGE_MS = 7 * 86_400_000;
const SWEEP_FAILED_AGE_MS = 48 * 3_600_000;

export const breaker = new CircuitBreaker(3, BREAKER_PAUSE_MS);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const enabled = () => process.env.ATTENDANCE_ENABLED !== 'false';
const pythonBin = () =>
  process.env.ERP_PYTHON ?? path.join(os.homedir(), '.hermes/venvs/erp/bin/python');
const fetcherPath = () => {
  const p = process.env.ERP_FETCHER;
  return p ? path.resolve(p) : path.join(process.cwd(), 'scripts/erp_fetch.py');
};

/** Atomic claim: SELECT ... FOR UPDATE SKIP LOCKED then stamp RUNNING. */
export async function claimJobs(
  tx: Prisma.TransactionClient,
  limit = CLAIM_BATCH,
  claimantId = CLAIMANT_ID,
): Promise<number[]> {
  const rows = await tx.$queryRaw<{ id: number }[]>(
    Prisma.sql`SELECT id FROM attendance_sync_jobs WHERE status = 'QUEUED' ORDER BY id ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED`,
  );
  if (rows.length === 0) return [];
  await tx.attendanceSyncJob.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: {
      status: 'RUNNING',
      startedAt: new Date(),
      claimantId,
      attempts: { increment: 1 },
    },
  });
  return rows.map((r) => r.id);
}

type FetchResult = { ok: true; stdout: string } | { ok: false; code: string };

function runFetcher(jobId: number, uid: string): Promise<FetchResult> {
  const workdir = `/tmp/erp/${jobId}`;
  return new Promise((resolve) => {
    const child = spawn(pythonBin(), [fetcherPath(), 'fast', '--workdir', workdir], {
      env: { ...process.env, ERP_USER: uid },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ ok: false, code: 'TIMEOUT' });
    }, FETCH_TIMEOUT_MS);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, code: `SPAWN_ERROR:${(err as NodeJS.ErrnoException).code ?? 'unknown'}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && /\nOK\s*$/.test(stdout)) return resolve({ ok: true, stdout });
      if (code === 2) return resolve({ ok: false, code: 'EXIT_2' });
      if (code !== 0) return resolve({ ok: false, code: `EXIT_${code}` });
      resolve({ ok: false, code: 'NO_OK_MARKER' });
    });
  });
}

/** Retry once (attempts<2 → requeue after 30s), else FAILED with error code. */
async function failOrRetry(jobId: number, code: string): Promise<void> {
  const job = await prisma.attendanceSyncJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  if (job.attempts < 2) {
    await prisma.attendanceSyncJob.update({
      where: { id: jobId },
      data: { status: 'QUEUED', startedAt: null, lastError: code },
    });
    await sleep(RETRY_DELAY_MS);
  } else {
    await prisma.attendanceSyncJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', finishedAt: new Date(), lastError: code },
    });
  }
}

/** One job: fetch → parse → transactional snapshot replace + SUCCESS. */
export async function processJob(jobId: number, uid: string): Promise<boolean> {
  const res = await runFetcher(jobId, uid);
  if (!res.ok) {
    breaker.recordFailure();
    await failOrRetry(jobId, res.code);
    return false;
  }
  const parsed = parseErpOutput(res.stdout);
  if (parsed.kind !== 'OK') {
    breaker.recordFailure();
    await failOrRetry(jobId, `PARSE_${parsed.kind}`);
    return false;
  }
  const periodStart = parsed.periodStart ? new Date(parsed.periodStart) : null;
  const periodEnd = parsed.periodEnd ? new Date(parsed.periodEnd) : null;
  await prisma.$transaction([
    prisma.attendanceSnapshot.deleteMany({ where: { uid } }),
    prisma.attendanceSnapshot.createMany({
      data: parsed.rows.map((r) => ({ uid, ...r, periodStart, periodEnd })),
    }),
    prisma.attendanceSyncJob.update({
      where: { id: jobId },
      data: { status: 'SUCCESS', finishedAt: new Date(), lastError: null },
    }),
  ]);
  breaker.recordSuccess();
  return true;
}

/** RUNNING >10 min → FAILED (crashed worker reclaim). */
export async function reclaimStale(): Promise<number> {
  const res = await prisma.attendanceSyncJob.updateMany({
    where: { status: 'RUNNING', startedAt: { lt: new Date(Date.now() - RUNNING_STALE_MS) } },
    data: { status: 'FAILED', finishedAt: new Date(), lastError: 'STALE_RECLAIM' },
  });
  if (res.count > 0) console.log(`stale-reclaim: ${res.count} RUNNING → FAILED`);
  return res.count;
}

/** Jobs >7 days old deleted; FAILED jobs deleted after 48h; snapshots of users
 *  who no longer exist deleted (plan §6 #10). */
export async function sweepOldJobs(): Promise<number> {
  const now = Date.now();
  const res = await prisma.$transaction([
    prisma.attendanceSyncJob.deleteMany({ where: { createdAt: { lt: new Date(now - SWEEP_JOB_AGE_MS) } } }),
    prisma.attendanceSyncJob.deleteMany({
      where: { status: 'FAILED', finishedAt: { lt: new Date(now - SWEEP_FAILED_AGE_MS) } },
    }),
    prisma.$executeRaw`DELETE FROM attendance_snapshots WHERE uid NOT IN (
      SELECT CONCAT('S', UPPER(SUBSTRING_INDEX(email, '@', 1)))
      FROM users WHERE email LIKE '%@tcetmumbai.in'
    )`,
  ]);
  const total = res[0].count + res[1].count;
  if (total > 0) console.log(`sweep: ${total} jobs deleted`);
  return total;
}

/** One drain pass: claim batches until empty / breaker open, then housekeeping. */
export async function runDrainPass(): Promise<{ claimed: number; succeeded: number; failed: number }> {
  if (!enabled()) {
    console.log('ATTENDANCE_DISABLED — worker paused');
    return { claimed: 0, succeeded: 0, failed: 0 };
  }
  let claimed = 0;
  let succeeded = 0;
  let failed = 0;
  while (true) {
    if (breaker.isOpen()) {
      console.log('CIRCUIT_OPEN — pausing 10 min');
      break;
    }
    let ids: number[] = [];
    await prisma.$transaction(async (tx) => {
      ids = await claimJobs(tx);
    });
    if (ids.length === 0) break;
    claimed += ids.length;
    const jobs = await prisma.attendanceSyncJob.findMany({
      where: { id: { in: ids } },
      select: { id: true, uid: true },
    });
    // Token bucket: ≥1s between fetcher starts (ERP ban protection, plan §6 #19).
    let nextStart = 0;
    const results = await Promise.all(
      jobs.map(async (job) => {
        const wait = Math.max(0, nextStart - Date.now());
        nextStart = Math.max(nextStart + MIN_START_GAP_MS, Date.now() + MIN_START_GAP_MS);
        if (wait > 0) await sleep(wait);
        return processJob(job.id, job.uid);
      }),
    );
    const ok = results.filter(Boolean).length;
    succeeded += ok;
    failed += results.length - ok;
  }
  await reclaimStale();
  await sweepOldJobs();
  return { claimed, succeeded, failed };
}

async function main() {
  const daemon = process.argv.includes('--daemon');
  console.log(`sync-erp-attendance ${daemon ? 'daemon' : 'drain'} (claimant ${CLAIMANT_ID})`);
  if (daemon) {
    while (true) {
      const r = await runDrainPass();
      if (r.claimed > 0) console.log('drain:', JSON.stringify(r));
      await sleep(DAEMON_POLL_MS);
    }
  } else {
    const r = await runDrainPass();
    console.log('drain:', JSON.stringify(r));
  }
  await prisma.$disconnect();
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
