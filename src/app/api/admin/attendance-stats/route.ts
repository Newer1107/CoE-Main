import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';

// GET /api/admin/attendance-stats — ERP attendance usage counters (admin only).
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const [rows, linked] = await Promise.all([
      prisma.attendanceStat.findMany(),
      prisma.user.count({ where: { erpPasswordEnc: { not: null } } }),
    ]);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return successRes({
      views: byKey.views ?? 0,
      refreshes: byKey.refreshes ?? 0,
      captchaAsks: byKey.captcha_asks ?? 0,
      passwordSaves: byKey.password_saves ?? 0,
      usersLinked: linked,
    });
  } catch (err) {
    console.error('Attendance stats error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
