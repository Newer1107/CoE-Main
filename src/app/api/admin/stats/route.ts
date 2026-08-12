import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { successRes, errorRes, authenticate, authorize } from '@/lib/api-helpers';

// GET /api/admin/stats — dashboard stats
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', [], 403);

    const [totalStudents, totalFaculty, pendingBookings, confirmedBookings, activeGrants, newsCount] = await Promise.all([
      prisma.user.count({ where: { role: 'STUDENT' } }),
      prisma.user.count({ where: { role: 'FACULTY' } }),
      prisma.booking.count({ where: { status: 'PENDING' } }),
      prisma.booking.count({ where: { status: 'CONFIRMED' } }),
      prisma.grant.count({ where: { isActive: true } }),
      prisma.newsPost.count({ where: { isVisible: true } }),
    ]);

    // Student registrations per day (last 30 days, server-local dates) — feeds
    // the overview chart. Bucketing in JS: user count is small, groupBy can't
    // do DATE() granularity.
    const DAY_MS = 86_400_000;
    const localKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      buckets.set(localKey(new Date(today.getTime() - i * DAY_MS)), 0);
    }
    const students = await prisma.user.findMany({
      where: { role: 'STUDENT' },
      select: { createdAt: true },
    });
    for (const s of students) {
      const created = new Date(s.createdAt);
      const key = localKey(created);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const registrationsByDay = [...buckets.entries()].map(([date, count]) => ({ date, count }));

    return successRes({
      totalStudents,
      totalFaculty,
      pendingBookings,
      confirmedBookings,
      activeGrants,
      newsCount,
      registrationsByDay,
    }, 'Stats retrieved.');
  } catch (err) {
    console.error('Admin stats error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
