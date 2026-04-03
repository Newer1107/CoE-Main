import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { successRes, errorRes, authenticate, authorize } from '@/lib/api-helpers';
import { sendBookingRejectionEmail } from '@/lib/mailer';
import { logActivity } from '@/lib/activity-log';

// PATCH /api/admin/bookings/[id]/reject
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', [], 403);

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const adminNote = (body as { adminNote?: string }).adminNote || '';

    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id) },
      include: { student: true },
    });
    if (!booking) return errorRes('Booking not found.', [], 404);
    if (booking.status !== 'PENDING') return errorRes('Only pending bookings can be rejected.', [], 400);

    await prisma.booking.update({
      where: { id: parseInt(id) },
      data: { status: 'REJECTED', adminNote },
    });

    const cancelledTickets = await (prisma as any).ticket?.updateMany?.({
      where: {
        bookingId: booking.id,
        status: 'ACTIVE',
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    }).catch(() => ({ count: 0 }));

    try {
      await sendBookingRejectionEmail(booking.student.email, {
        id: booking.id,
        date: booking.date.toISOString().split('T')[0],
        timeSlot: booking.timeSlot,
        lab: booking.lab,
        facilities: booking.facilities as string[],
      }, adminNote);
    } catch (emailErr) {
      console.error('Booking rejection email failed:', emailErr);
    }

    logActivity('BOOKING_REJECTED', {
      bookingId: booking.id,
      studentId: booking.student.id,
      rejectedBy: user.id,
      cancelledTicketCount: cancelledTickets?.count ?? 0,
    });

    return successRes(null, 'Booking rejected.');
  } catch (err) {
    console.error('Booking reject error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
