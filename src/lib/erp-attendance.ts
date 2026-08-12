/**
 * ERP attendance — shared domain logic (uid derivation, fetcher-output parser,
 * circuit breaker). Pure and importable by API routes, the sync worker, and
 * the assert-based checks (scripts/checks/erp-checks.ts).
 */
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

export const ERP_EMAIL_DOMAIN = 'tcetmumbai.in';

/** ERP ID = "S" + email local part (verified against dev users: local parts are
 *  digits, e.g. 1032241230@tcetmumbai.in → S1032241230). Non-TCET emails → null. */
export function deriveErpUid(email: string | null | undefined): string | null {
  if (!email) return null;
  const local = email.split('@')[0] ?? '';
  if (!email.endsWith(`@${ERP_EMAIL_DOMAIN}`) || !/^[a-zA-Z0-9._-]+$/.test(local)) return null;
  const upper = local.toUpperCase();
  return upper.startsWith('S') ? upper : `S${upper}`;
}

/** Inverse of deriveErpUid: 'S1032241230' → '1032241230@tcetmumbai.in'. */
export function reverseErpUid(uid: string): string | null {
  const local = uid.startsWith('S') ? uid.slice(1) : uid;
  if (!/^[a-zA-Z0-9._-]+$/.test(local)) return null;
  return `${local.toLowerCase()}@${ERP_EMAIL_DOMAIN}`;
}

/** AES-256-GCM envelope for ERP passwords. Key is derived from the JWT secret
 *  (already secret + stable on every host) — no new env var to manage.
 *  Format: base64(iv || tag || ciphertext). */
const erpPassKey = () =>
  createHash('sha256').update(process.env.JWT_ACCESS_SECRET ?? 'erp-pass-key-change-me').digest();

export function encryptErpPassword(password: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', erpPassKey(), iv);
  const ct = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

export function decryptErpPassword(enc: string): string {
  const buf = Buffer.from(enc, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', erpPassKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/** Atomic usage counter (views/refreshes/captcha_asks/password_saves).
 *  Never throws — stats must not break the feature they observe. */
export async function bumpAttendanceStat(
  prisma: {
    attendanceStat: {
      upsert: (args: {
        where: { key: string };
        create: { key: string; value: number };
        update: { value: { increment: number } };
      }) => Promise<unknown>;
    };
  },
  key: string,
): Promise<void> {
  try {
    await prisma.attendanceStat.upsert({
      where: { key },
      create: { key, value: 1 },
      update: { value: { increment: 1 } },
    });
  } catch {
    /* stats failure is silent by design */
  }
}

/** A correctly-solved captcha that still yields an empty report is usually the
 *  ERP's node lottery (multi-node LB with inconsistent data) — retry once with
 *  a fresh session so the next attempt gets a new node. */
export function shouldRetryEmptySolve(isSolve: boolean, kind: string, attempts: number): boolean {
  return isSolve && (kind === 'EMPTY' || kind === 'NO_RECORD') && attempts < 2;
}

export type AttendanceRow = {
  subject: string;
  type: string; // TH | PR | TU
  present: number;
  total: number;
  percentage: number;
};
export type ParsedAttendance =
  | { kind: 'OK'; rows: AttendanceRow[]; periodStart: string | null; periodEnd: string | null }
  | { kind: 'EMPTY' } // period header, no subjects (new semester)
  | { kind: 'NO_RECORD' } // no period header at all (ERP has no record for the ID)
  | { kind: 'LOGIN_FORM' } // error page / auth lost — report never rendered
  | { kind: 'UNKNOWN_SHAPE' }; // format change — never store garbage

const toInt = (s: string): number => {
  const n = parseInt(s.replace(/[^\d.-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

/** Parse `fast`-mode stdout: ' | '-separated rows; period row carries dates.
 *  Only row lines are inspected — OCR/attempt lines are ignored. */
export function parseErpOutput(stdout: string): ParsedAttendance {
  if (/NOT AUTHENTICATED/.test(stdout)) return { kind: 'LOGIN_FORM' };
  const lines = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.includes(' | '));

  const cellsOf = (l: string) => l.split(' | ').map((c) => c.trim());

  // Period row is a single cell ("Period: 2025-08-01 To ...") — no ' | ' separators.
  // Real ERP header: "Period Start Date | : | 01/07/2026 | Period End Date | : | 12/08/2026".
  const periodLine = stdout
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('Period'));
  const toIso = (d: string) => {
    const [a, b, c] = d.split('/');
    return `${c}-${b}-${a}`;
  };
  const dmY = periodLine?.match(/\d{1,2}\/\d{1,2}\/\d{4}/g) ?? [];
  const ymd = periodLine?.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  const periodStart = (dmY[0] ? toIso(dmY[0]) : ymd[0]) ?? null;
  const periodEnd = (dmY[1] ? toIso(dmY[1]) : ymd[1]) ?? null;

  const SUBJECT_TYPES = new Set(['TH', 'PR', 'TU']);
  const SUMMARY_ROWS = new Set(['Theory', 'Practical', 'Tutorial', 'Total']);

  // Every component counts: a subject row (SrNo | Subject | Type | P | T | %)
  // is followed by component sub-rows (Type | P | T | %) for its extra
  // practical/tutorial parts (e.g. Microprocessor TH 11/17 + PR 6/6).
  // Components are merged per subject+type so sums reproduce the ERP's own
  // Theory/Practical/Tutorial/Total summary rows exactly.
  const merged = new Map<string, AttendanceRow>();
  let currentSubject = '';
  const addRow = (subject: string, type: string, presentRaw: string, totalRaw: string) => {
    const present = toInt(presentRaw);
    const total = toInt(totalRaw);
    const key = `${subject}\u0000${type}`;
    const existing = merged.get(key);
    if (existing) {
      const p = existing.present + present;
      const t = existing.total + total;
      merged.set(key, {
        subject,
        type,
        present: p,
        total: t,
        percentage: t > 0 ? Math.round((p / t) * 10000) / 100 : 0,
      });
    } else {
      merged.set(key, {
        subject,
        type,
        present,
        total,
        percentage: total > 0 ? Math.round((present / total) * 10000) / 100 : 0,
      });
    }
  };

  for (const cells of lines.map(cellsOf)) {
    const head = cells[0] ?? '';
    if (head === 'SrNo' || head.startsWith('Period')) continue; // header / period row
    if (SUMMARY_ROWS.has(head)) continue; // summary rows — recomputed from components
    if (/^\d+$/.test(head)) {
      if (cells.length < 6) return { kind: 'UNKNOWN_SHAPE' }; // format change — fail loud
      currentSubject = cells[1];
      addRow(currentSubject, cells[2], cells[3], cells[4]);
      continue;
    }
    if (SUBJECT_TYPES.has(head) && cells.length === 4) {
      if (!currentSubject) return { kind: 'UNKNOWN_SHAPE' }; // orphan component
      addRow(currentSubject, head, cells[1], cells[2]);
      continue;
    }
    // footer / noise rows — ignore
  }

  if (merged.size === 0) {
    return periodLine ? { kind: 'EMPTY' } : { kind: 'NO_RECORD' };
  }

  return { kind: 'OK', periodStart, periodEnd, rows: [...merged.values()] };
}

/** Global backoff: 3 consecutive failures across ALL jobs → open for 10 min.
 *  Clock injectable for the check. */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;

  constructor(
    private readonly threshold = 3,
    private readonly cooldownMs = 10 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.threshold && this.openedAt === null) this.openedAt = this.now();
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  isOpen(): boolean {
    return this.openedAt !== null && this.now() - this.openedAt < this.cooldownMs;
  }
}
