import prisma from '@/lib/prisma';
import { sendBookingReminderEmail } from '@/lib/mailer';
import { NextRequest } from 'next/server';
import { authenticate, authorize } from '@/lib/api-helpers';
import { bookingDateTimeFromIST } from '@/lib/time';

function isAuthorizedCron(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  const providedSecret = (req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret') || '').trim();

  if (expectedSecret) {
    return providedSecret === expectedSecret;
  }

  const user = authenticate(req);
  return Boolean(user && authorize(user, 'ADMIN'));
}

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorizedCron(req)) {
      return Response.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const now = new Date();
    const thirtyMinsLater = new Date(now.getTime() + 30 * 60 * 1000);

    const bookings = await prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        reminderSent: false,
      },
      include: { student: true },
    });

    let sent = 0;

    for (const booking of bookings) {
      try {
        const bookingStart = bookingDateTimeFromIST(
          booking.date,
          booking.timeSlot
        );

        if (
          bookingStart >= now &&
          bookingStart <= thirtyMinsLater
        ) {
          console.log(`Sending reminder for booking ${booking.id}`);

          await sendBookingReminderEmail(booking.student.email, {
            id: booking.id,
            date: booking.date.toISOString().split('T')[0],
            timeSlot: booking.timeSlot,
            lab: booking.lab,
            facilities: booking.facilities as string[],
          });

          // Step 4: Mark as sent
          await prisma.booking.update({
            where: { id: booking.id },
            data: { reminderSent: true },
          });

          sent++;
        }
      } catch (emailErr) {
        console.error(
          `Reminder email failed for booking ${booking.id}:`,
          emailErr
        );
      }
    }

    // Step 5: Clean expired OTPs
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    await prisma.otp.deleteMany({
      where: { createdAt: { lt: thirtyMinutesAgo } },
    });

    return Response.json({
      success: true,
      message: `Cron executed. ${sent} reminder(s) sent.`,
    });
  } catch (err) {
    console.error('Cron error:', err);

    return Response.json(
      { success: false, message: 'Cron failed.' },
      { status: 500 }
    );
  }
}