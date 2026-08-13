import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';

// GET /api/admin/attendance-stats — ERP attendance usage counters (admin only).
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const [rows, linked, qQueued, qRunning, qCaptcha, qFailed] = await Promise.all([
      prisma.attendanceStat.findMany(),
      prisma.user.count({ where: { erpPasswordEnc: { not: null } } }),
      prisma.attendanceSyncJob.count({ where: { status: 'QUEUED' } }),
      prisma.attendanceSyncJob.count({ where: { status: 'RUNNING' } }),
      prisma.attendanceSyncJob.count({ where: { status: 'AWAITING_CAPTCHA' } }),
      prisma.attendanceSyncJob.count({ where: { status: 'FAILED' } }),
    ]);
    const pause = await prisma.attendanceStat.findUnique({ where: { key: 'erp_paused_until' } });
    const erpPaused = !!pause && pause.value * 1000 > Date.now();
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return successRes({
      views: byKey.views ?? 0,
      refreshes: byKey.refreshes ?? 0,
      captchaAsks: byKey.captcha_asks ?? 0,
      passwordSaves: byKey.password_saves ?? 0,
      usersLinked: linked,
      queue: { queued: qQueued, running: qRunning, awaitingCaptcha: qCaptcha, failed: qFailed },
      erpPaused,
    });
  } catch (err) {
    console.error('Attendance stats error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
