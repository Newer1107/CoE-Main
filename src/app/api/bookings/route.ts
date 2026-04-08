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
    const [yearStr, monthStr, dayStr] = date.split('-');
    const bookingDate = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));

    if (Number.isNaN(bookingDate.getTime())) {
      return errorRes('Validation failed', ['Invalid booking date.'], 400);
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const maxDate = new Date(today);
    maxDate.setMonth(maxDate.getMonth() + 1);

    if (bookingDate < today) {
      return errorRes('Validation failed', ['Booking date cannot be in the past.'], 400);
    }

    if (bookingDate > maxDate) {
      return errorRes('Validation failed', ['Booking date cannot be more than 1 month from today.'], 400);
    }

    const booking = await prisma.booking.create({
      data: {
        studentId: user.id,
        purpose,
        date: bookingDate,
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
