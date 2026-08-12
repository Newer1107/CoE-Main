import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { deriveErpUid, bumpAttendanceStat } from '@/lib/erp-attendance';

const REFRESH_LIMIT = 2;
const REFRESH_WINDOW_MS = 5 * 60 * 1000;

// POST /api/attendance/refresh — enqueue a sync job (deduped per uid),
// rate-limited to REFRESH_LIMIT presses per REFRESH_WINDOW_MS per student.
export async function POST(req: NextRequest) {
  try {
    if (process.env.ATTENDANCE_ENABLED === 'false') {
      return errorRes('Attendance sync is disabled', [], 403);
    }
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const uid = deriveErpUid(user.email);
    if (!uid) return errorRes('No ERP account linked to this email', [], 400);

    void bumpAttendanceStat(prisma, 'refreshes');

    // Atomic rate-limit check (race-safe predicate updates on the per-user
    // limit row; the window boundary race allows at most one extra press).
    // 1) expired window → reset. 2) live window under limit → increment.
    // 3) no row yet → create. Otherwise → 429.
    const cutoff = new Date(Date.now() - REFRESH_WINDOW_MS);
    const reset = await prisma.attendanceRefreshLimit.updateMany({
      where: { userId: user.id, windowStart: { lt: cutoff } },
      data: { count: 1, windowStart: new Date() },
    });
    let allowed = reset.count > 0;
    if (!allowed) {
      const inc = await prisma.attendanceRefreshLimit.updateMany({
        where: { userId: user.id, windowStart: { gte: cutoff }, count: { lt: REFRESH_LIMIT } },
        data: { count: { increment: 1 } },
      });
      allowed = inc.count > 0;
    }
    if (!allowed) {
      const created = await prisma.attendanceRefreshLimit
        .create({ data: { userId: user.id, windowStart: new Date(), count: 1 } })
        .catch(() => null);
      allowed = created !== null;
    }
    if (!allowed) {
      const row = await prisma.attendanceRefreshLimit.findUnique({
        where: { userId: user.id },
        select: { windowStart: true },
      });
      const retryAfter = row
        ? Math.max(0, Math.ceil((row.windowStart.getTime() + REFRESH_WINDOW_MS - Date.now()) / 1000))
        : REFRESH_WINDOW_MS / 1000;
      return NextResponse.json(
        {
          success: false,
          message: 'Refresh limit reached',
          data: null,
          errors: [`Try again in ${Math.ceil(retryAfter / 60)} minute(s).`],
          retryAfterSeconds: retryAfter,
        },
        { status: 429 },
      );
    }

    const existing = await prisma.attendanceSyncJob.findFirst({
      where: { uid, status: { in: ['QUEUED', 'RUNNING'] } },
      select: { id: true, status: true },
    });
    if (existing) {
      return successRes({ jobId: existing.id, status: existing.status, deduped: true });
    }
    const job = await prisma.attendanceSyncJob.create({ data: { uid } });
    return successRes({ jobId: job.id, status: job.status, deduped: false });
  } catch (err) {
    console.error('Attendance refresh error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
