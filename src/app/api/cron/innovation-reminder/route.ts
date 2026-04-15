import prisma from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { getEventParticipantEmails } from '@/lib/innovation';
import { processEmailQueue } from '@/lib/email-delivery';
import {
  sendInnovationEventActiveEmail,
  sendInnovationEventReminderEmail,
  sendInnovationEventUpcomingBroadcastEmail,
} from '@/lib/mailer';

type InnovationCronMode = 'ALL' | 'UPCOMING_ALL_STUDENTS' | 'ACTIVATE_REGISTERED' | 'ENDING_REMINDER';

const isAuthorizedCron = (req: NextRequest) => {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  const providedSecret = (req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret') || '').trim();

  if (expectedSecret) {
    return providedSecret === expectedSecret;
  }

  const user = authenticate(req);
  return Boolean(user && authorize(user, 'ADMIN'));
};

const parseMode = (raw: string | null): InnovationCronMode => {
  const normalized = (raw || '').trim().toUpperCase();
  if (normalized === 'UPCOMING_ALL_STUDENTS') return 'UPCOMING_ALL_STUDENTS';
  if (normalized === 'ACTIVATE_REGISTERED') return 'ACTIVATE_REGISTERED';
  if (normalized === 'ENDING_REMINDER') return 'ENDING_REMINDER';
  return 'ALL';
};

// GET /api/cron/innovation-reminder
export async function GET(req: NextRequest) {
  try {
    if (!isAuthorizedCron(req)) {
      return errorRes('Forbidden', ['Invalid cron secret or admin credentials required'], 403);
    }

    const search = req.nextUrl.searchParams;
    const mode = parseMode(search.get('mode'));
    const eventIdRaw = search.get('eventId');
    const eventId = eventIdRaw ? Number(eventIdRaw) : null;

    if (eventIdRaw && (!Number.isInteger(eventId) || (eventId ?? 0) <= 0)) {
      return errorRes('Validation failed.', ['eventId must be a positive integer.'], 400);
    }

    const now = new Date();
    const inThirty = new Date(now.getTime() + 30 * 60 * 1000);

    const shouldRunUpcomingBroadcast = mode === 'ALL' || mode === 'UPCOMING_ALL_STUDENTS';
    const shouldRunActivationNotifications = mode === 'ALL' || mode === 'ACTIVATE_REGISTERED';
    const shouldRunEndingReminders = mode === 'ALL' || mode === 'ENDING_REMINDER';

    const eventFilter = eventId ? { id: eventId } : {};

    let upcomingEventsNotified = 0;
    let upcomingNotificationsSent = 0;
    let activatedEvents = 0;
    let activeNotificationsSent = 0;
    let reminderEvents = 0;
    let remindersSent = 0;

    if (shouldRunUpcomingBroadcast) {
      const activeStudentRows = await prisma.user.findMany({
        where: {
          role: 'STUDENT',
          status: 'ACTIVE',
        },
        select: { email: true },
      });
      const activeStudentEmails = Array.from(new Set(activeStudentRows.map((row) => row.email)));

      const upcomingEvents = await prisma.hackathonEvent.findMany({
        where: {
          ...eventFilter,
          status: 'UPCOMING',
          startTime: { gt: now },
        },
        select: { id: true, title: true, startTime: true },
        orderBy: { startTime: 'asc' },
      });

      if (activeStudentEmails.length > 0) {
        for (const event of upcomingEvents) {
          try {
            await sendInnovationEventUpcomingBroadcastEmail(activeStudentEmails, {
              eventTitle: event.title,
              startTime: event.startTime.toISOString(),
            });
            upcomingEventsNotified += 1;
            upcomingNotificationsSent += activeStudentEmails.length;
          } catch (mailErr) {
            console.error(`Upcoming broadcast failed for event ${event.id}:`, mailErr);
          }
        }
      }
    }

    if (shouldRunActivationNotifications) {
      const upcomingToActivate = await prisma.hackathonEvent.findMany({
        where: {
          ...eventFilter,
          status: 'UPCOMING',
          startTime: { lte: now },
        },
        select: { id: true, title: true },
      });

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
    }

    if (shouldRunEndingReminders) {
      const endingSoonEvents = await prisma.hackathonEvent.findMany({
        where: {
          ...eventFilter,
          status: 'ACTIVE',
          endTime: { gt: now, lte: inThirty },
        },
        select: { id: true, title: true, endTime: true },
      });

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
    }

    if (shouldRunUpcomingBroadcast || shouldRunActivationNotifications || shouldRunEndingReminders) {
      try {
        await processEmailQueue(50);
      } catch (queueErr) {
        console.error('Email queue drain after innovation reminder cron failed:', queueErr);
      }
    }

    return successRes(
      {
        mode,
        eventId,
        upcomingEventsNotified,
        upcomingNotificationsSent,
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
