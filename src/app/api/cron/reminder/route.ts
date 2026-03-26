import prisma from '@/lib/prisma';
import { sendBookingReminderEmail } from '@/lib/mailer';

/**
 * Combines booking.date + booking.timeSlot into a proper Date object
 */
function getBookingStartDateTime(date: Date, timeSlot: string): Date {
  const [startTime] = timeSlot.split(' - '); // "18:00"
  const [hours, minutes] = startTime.split(':').map(Number);

  const bookingDateTime = new Date(date);
  bookingDateTime.setHours(hours, minutes, 0, 0);

  return bookingDateTime;
}

export async function GET() {
  try {
    const now = new Date();
    const thirtyMinsLater = new Date(now.getTime() + 30 * 60 * 1000);

    console.log('NOW:', now.toISOString());
    console.log('30 MINS LATER:', thirtyMinsLater.toISOString());

    // Step 1: Fetch relevant bookings (no date filtering here)
    const bookings = await prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        reminderSent: false,
      },
      include: { student: true },
    });

    let sent = 0;

    // Step 2: Process each booking
    for (const booking of bookings) {
      try {
        const bookingStart = getBookingStartDateTime(
          booking.date,
          booking.timeSlot
        );

        console.log(
          `Booking ${booking.id} starts at:`,
          bookingStart.toISOString()
        );

        // Step 3: Check if within next 30 minutes
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
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    await prisma.otp.deleteMany({
      where: { createdAt: { lt: tenMinutesAgo } },
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