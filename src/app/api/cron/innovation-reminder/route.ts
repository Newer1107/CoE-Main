import prisma from '@/lib/prisma';
import { errorRes, successRes } from '@/lib/api-helpers';
import { getEventParticipantEmails } from '@/lib/innovation';
import { sendInnovationEventJudgingEmail, sendInnovationEventReminderEmail } from '@/lib/mailer';

// GET /api/cron/innovation-reminder
export async function GET() {
  try {
    const now = new Date();
    const inThirty = new Date(now.getTime() + 30 * 60 * 1000);

    const activated = await prisma.hackathonEvent.updateMany({
      where: {
        status: 'UPCOMING',
        startTime: { lte: now },
      },
      data: { status: 'ACTIVE' },
    });

    const expiredActiveEvents = await prisma.hackathonEvent.findMany({
      where: {
        status: 'ACTIVE',
        endTime: { lte: now },
      },
      select: { id: true, title: true },
    });

    let movedToJudging = 0;
    let autoSubmittedClaims = 0;
    let judgingNotificationsSent = 0;

    for (const event of expiredActiveEvents) {
      await prisma.$transaction(async (tx) => {
        await tx.hackathonEvent.update({ where: { id: event.id }, data: { status: 'JUDGING' } });

        const result = await tx.claim.updateMany({
          where: {
            status: 'IN_PROGRESS',
            problem: { eventId: event.id },
          },
          data: { status: 'SUBMITTED' },
        });

        autoSubmittedClaims += result.count;
      });

      movedToJudging += 1;

      const emails = await getEventParticipantEmails(prisma, event.id);
      if (emails.length > 0) {
        try {
          await sendInnovationEventJudgingEmail(emails, { eventTitle: event.title });
          judgingNotificationsSent += emails.length;
        } catch (mailErr) {
          console.error(`Judging notification failed for event ${event.id}:`, mailErr);
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
        activatedEvents: activated.count,
        movedToJudging,
        autoSubmittedClaims,
        reminderEvents,
        remindersSent,
        judgingNotificationsSent,
      },
      'Innovation cron executed successfully.'
    );
  } catch (err) {
    console.error('Innovation cron error:', err);
    return errorRes('Innovation cron failed.', [], 500);
  }
}
