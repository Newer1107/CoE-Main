import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { successRes, errorRes, authenticate, authorize } from '@/lib/api-helpers';
import { dispatchEmail } from '@/lib/email-delivery';
import { bookingCreateSchema } from '@/lib/validators';

// POST /api/bookings — student creates booking
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden. Students only.', [], 403);

    const body = await req.json();
    const parsed = bookingCreateSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((e: any) => e.message), 400);

    const { purpose, date, timeSlot, facilities, lab } = parsed.data;

    const booking = await prisma.booking.create({
      data: {
        studentId: user.id,
        purpose,
        date: new Date(date),
        timeSlot,
        facilities: facilities as unknown as string[],
        lab,
      },
    });

    // Notify admin (best-effort)
    try {
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        await dispatchEmail({
          to: adminEmail,
          subject: `New Facility Booking Request from ${user.name}`,
          html: `<p>New facility booking request from <strong>${user.name}</strong> for <strong>${date}</strong> (${timeSlot}) at <strong>${lab}</strong>.</p>`,
          mode: 'immediate',
          category: 'ADMIN_BOOKING_REQUEST',
        });
      }
    } catch (emailErr) {
      console.error('Admin booking notification failed:', emailErr);
    }

    return successRes(booking, 'Booking request submitted successfully.', 201);
  } catch (err) {
    console.error('Booking create error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// GET /api/bookings — not used directly (use /api/bookings/my for students)
export async function GET() {
  return errorRes('Use /api/bookings/my for student bookings or /api/admin/bookings for admin.', [], 400);
}
