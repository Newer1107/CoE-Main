import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { successRes, errorRes, authenticate, authorize } from '@/lib/api-helpers';

// GET /api/admin/bookings — all bookings with optional status/date filter
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', [], 403);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const dateStr = searchParams.get('date');

    const where: Record<string, unknown> = {};
    if (status) where.status = status.toUpperCase();
    if (dateStr) {
      const d = new Date(dateStr);
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);
      where.date = { gte: d, lt: nextDay };
    }

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        student: { select: { id: true, name: true, email: true, uid: true } },
        ticket: { select: { id: true, ticketId: true, status: true, usedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return successRes(bookings, 'Bookings retrieved.');
  } catch (err) {
    console.error('Admin bookings error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
