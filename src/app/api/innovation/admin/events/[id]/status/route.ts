import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationEventStatusSchema } from '@/lib/validators';
import { canTransitionEventStatus, getEventLeaderboard, getEventParticipantEmails } from '@/lib/innovation';
import { sendInnovationEventActiveEmail, sendInnovationWinnerEmail } from '@/lib/mailer';

// PATCH /api/innovation/admin/events/[id]/status
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN', 'FACULTY')) return errorRes('Forbidden', ['Faculty or admin access required'], 403);

    const { id } = await params;
    const eventId = Number(id);
    if (!Number.isInteger(eventId) || eventId <= 0) return errorRes('Invalid event id', [], 400);

    const body = await req.json();
    const parsed = innovationEventStatusSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
    if (!event) return errorRes('Hackathon event not found', [], 404);

    if (!authorize(user, 'ADMIN') && event.createdById !== user.id) {
      return errorRes('Forbidden', ['You can only change status for events you created'], 403);
    }

    const nextStatus = parsed.data.status;
    if (event.status === nextStatus) {
      return successRes(event, 'Event status already set.');
    }

    if (!canTransitionEventStatus(event.status, nextStatus)) {
      return errorRes('Invalid status transition', [`${event.status} can only transition to the next stage`], 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (nextStatus === 'CLOSED') {
        await tx.claim.updateMany({
          where: {
            status: 'IN_PROGRESS',
            problem: { eventId },
          },
          data: { status: 'SUBMITTED' },
        });
      }

      return tx.hackathonEvent.update({
        where: { id: eventId },
        data: { status: nextStatus },
      });
    });

    if (nextStatus === 'ACTIVE') {
      const emails = await getEventParticipantEmails(prisma, eventId);
      if (emails.length > 0) {
        try {
          await sendInnovationEventActiveEmail(emails, { eventTitle: updated.title });
        } catch (mailErr) {
          console.error('Innovation active transition email failed:', mailErr);
        }
      }
    }

    if (nextStatus === 'CLOSED') {
      const top = (await getEventLeaderboard(prisma, eventId)).slice(0, 3);
      for (const row of top) {
        const members = await prisma.claimMember.findMany({
          where: { claimId: row.claimId },
          include: { user: { select: { email: true } } },
        });
        const emails = Array.from(new Set(members.map((member) => member.user.email)));
        if (emails.length > 0) {
          try {
            await sendInnovationWinnerEmail(emails, {
              eventTitle: updated.title,
              rank: row.rank,
              score: row.score,
            });
          } catch (mailErr) {
            console.error('Innovation winners email failed:', mailErr);
          }
        }
      }
    }

    return successRes(updated, 'Event status updated successfully.');
  } catch (err) {
    console.error('Innovation admin event status PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
