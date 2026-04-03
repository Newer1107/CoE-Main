import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { processEmailQueue } from '@/lib/email-delivery';
import { innovationEventStatusSchema } from '@/lib/validators';
import { canTransitionEventStatus, getEventLeaderboard, getEventParticipantEmails } from '@/lib/innovation';
import { sendInnovationEventActiveEmail, sendInnovationEventClosedScoreEmail } from '@/lib/mailer';

// PATCH /api/innovation/admin/events/[id]/status
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { id } = await params;
    const eventId = Number(id);
    if (!Number.isInteger(eventId) || eventId <= 0) return errorRes('Invalid event id', [], 400);

    const body = await req.json();
    const parsed = innovationEventStatusSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
    if (!event) return errorRes('Hackathon event not found', [], 404);

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
      const leaderboard = await getEventLeaderboard(prisma, eventId);
      const rankByClaimId = new Map<number, number>();
      for (const row of leaderboard) {
        rankByClaimId.set(row.claimId, row.rank);
      }

      const claims = await prisma.claim.findMany({
        where: {
          problem: { eventId },
          members: { some: {} },
        },
        select: {
          id: true,
          teamName: true,
          finalScore: true,
          score: true,
          members: {
            select: {
              user: { select: { email: true } },
            },
          },
        },
      });

      const baseUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const leaderboardUrl = `${baseUrl}/innovation/events/${eventId}`;

      for (const claim of claims) {
        const emails = Array.from(new Set(claim.members.map((member) => member.user.email)));
        if (emails.length === 0) continue;

        try {
          await sendInnovationEventClosedScoreEmail(emails, {
            eventTitle: updated.title,
            teamName: claim.teamName || `Team-${claim.id}`,
            score: claim.finalScore ?? claim.score ?? null,
            rank: rankByClaimId.get(claim.id) ?? null,
            leaderboardUrl,
          });
        } catch (mailErr) {
          console.error('Innovation closed result email failed:', mailErr);
        }
      }
    }

    try {
      await processEmailQueue(50);
    } catch (queueErr) {
      console.error('Email queue drain after event status update failed:', queueErr);
    }

    return successRes(updated, 'Event status updated successfully.');
  } catch (err) {
    console.error('Innovation admin event status PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
