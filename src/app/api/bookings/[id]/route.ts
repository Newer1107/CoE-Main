import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { successRes, errorRes, authenticate, authorize } from '@/lib/api-helpers';
import { logActivity } from '@/lib/activity-log';

// DELETE /api/bookings/[id] — student/faculty cancels own pending booking
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT', 'FACULTY')) return errorRes('Forbidden', [], 403);

    const { id } = await params;
    const bookingId = parseInt(id);

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return errorRes('Booking not found.', [], 404);
    if (booking.studentId !== user.id) return errorRes('You can only cancel your own bookings.', [], 403);
    if (booking.status !== 'PENDING') return errorRes('Only pending bookings can be cancelled.', [], 400);

    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED' },
    });

    const cancelledTickets = await (prisma as any).ticket?.updateMany?.({
      where: {
        bookingId,
        status: 'ACTIVE',
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    }).catch(() => ({ count: 0 }));

    logActivity('BOOKING_CANCELLED', {
      bookingId,
      studentId: user.id,
      cancelledTicketCount: cancelledTickets?.count ?? 0,
    });

    return successRes(null, 'Booking cancelled successfully.');
  } catch (err) {
    console.error('Booking cancel error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
