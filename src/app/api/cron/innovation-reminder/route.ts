import prisma from '@/lib/prisma';
import { errorRes, successRes } from '@/lib/api-helpers';
import { getEventParticipantEmails } from '@/lib/innovation';
import { sendInnovationEventActiveEmail, sendInnovationEventReminderEmail } from '@/lib/mailer';

// GET /api/cron/innovation-reminder
export async function GET() {
  try {
    const now = new Date();
    const inThirty = new Date(now.getTime() + 30 * 60 * 1000);

    const upcomingToActivate = await prisma.hackathonEvent.findMany({
      where: {
        status: 'UPCOMING',
        startTime: { lte: now },
      },
      select: { id: true, title: true },
    });

    let activatedEvents = 0;
    let activeNotificationsSent = 0;

    for (const event of upcomingToActivate) {
      const didActivate = await prisma.$transaction(async (tx) => {
        const activation = await tx.hackathonEvent.updateMany({
          where: { id: event.id, status: 'UPCOMING' },
          data: { status: 'ACTIVE' },
        });

        if (activation.count === 0) return false;
        activatedEvents += 1;
        return true;
      });

      if (!didActivate) continue;

      const emails = await getEventParticipantEmails(prisma, event.id);
      if (emails.length > 0) {
        try {
          await sendInnovationEventActiveEmail(emails, { eventTitle: event.title });
          activeNotificationsSent += emails.length;
        } catch (mailErr) {
          console.error(`Active notification failed for event ${event.id}:`, mailErr);
        }
      }
    }

    const endingSoonEvents = await prisma.hackathonEvent.findMany({
      where: {
        status: 'ACTIVE',
        endTime: { gt: now, lte: inThirty },
      },
      select: { id: true, title: true, endTime: true },
    });

    let reminderEvents = 0;
    let remindersSent = 0;

    for (const event of endingSoonEvents) {
      const claimRows = await prisma.claim.findMany({
        where: {
          reminderSent: false,
          problem: { eventId: event.id },
        },
        include: {
          members: {
            include: {
              user: { select: { email: true } },
            },
          },
        },
      });

      if (claimRows.length === 0) continue;

      const emailSet = new Set<string>();
      claimRows.forEach((claim) => {
        claim.members.forEach((member) => emailSet.add(member.user.email));
      });
      const emails = Array.from(emailSet);

      if (emails.length > 0) {
        try {
          await sendInnovationEventReminderEmail(emails, {
            eventTitle: event.title,
            endTime: event.endTime.toISOString(),
          });

          reminderEvents += 1;
          remindersSent += emails.length;

          await prisma.claim.updateMany({
            where: {
              id: { in: claimRows.map((claim) => claim.id) },
            },
            data: { reminderSent: true },
          });
        } catch (mailErr) {
          console.error(`Reminder failed for event ${event.id}:`, mailErr);
        }
      }
    }

    return successRes(
      {
        activatedEvents,
        reminderEvents,
        remindersSent,
        activeNotificationsSent,
      },
      'Innovation cron executed successfully.'
    );
  } catch (err) {
    console.error('Innovation cron error:', err);
    return errorRes('Innovation cron failed.', [], 500);
  }
}
