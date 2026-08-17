import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { processEmailQueue } from '@/lib/email-delivery';
import { innovationEventStatusSchema } from '@/lib/validators';
import { canTransitionEventStatus, getEventLeaderboard, getEventParticipantEmails } from '@/lib/innovation';
import { issueCertificatesForEvent } from '@/lib/certificate-issuance';
import { sendInnovationEventActiveEmail, sendInnovationEventClosedScoreEmail } from '@/lib/mailer';
import { canManageEvent } from '@/lib/hackathon-ops';

// GET /api/innovation/admin/events/[id]/status — current event status (admin or event coordinator)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const event = await prisma.hackathonEvent.findUnique({
      where: { id: eventId },
      select: { id: true, status: true, registrationOpen: true, title: true, coordinatorId: true, coordinators: { select: { userId: true } }, submissionLockAt: true },
    });
    if (!event) return errorRes('Hackathon event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);
    return successRes(event);
  } catch (err) {
    console.error('Event status GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// PATCH /api/innovation/admin/events/[id]/status
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN') && !authorize(user, 'FACULTY')) {
      return errorRes('Forbidden', ['Coordinator access required'], 403);
    }

    const { id } = await params;
    const eventId = Number(id);
    if (!Number.isInteger(eventId) || eventId <= 0) return errorRes('Invalid event id', [], 400);

    const body = await req.json();
    const parsed = innovationEventStatusSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
    if (!event) return errorRes('Hackathon event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);

    const nextStatus = parsed.data.status;
    if (event.status === nextStatus) {
      return successRes(event, 'Event status already set.');
    }

    if (!canTransitionEventStatus(event.status, nextStatus)) {
      return errorRes('Invalid status transition', [`${event.status} can only transition to the next stage`], 400);
    }

    if (nextStatus === 'CLOSED') {
      const unjudged = await prisma.claim.count({
        where: {
          problem: { eventId },
          rubricScores: { none: {} },
        },
      });
      if (unjudged > 0) {
        return errorRes(
          'Pending judging',
          [
            `${unjudged} submission${unjudged === 1 ? '' : 's'} still await${unjudged === 1 ? 's' : ''} a rubric score. Score them before closing the event.`,
          ],
          400
        );
      }
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

        // Finalize rubric totals using binary weight calculation (SIH 5-param model).
        // Binary: each question is 0 or 1. Parent weight determines contribution.
        // finalScore = sum( (YES count / 5) * parentWeight ) → 0–100.
        const categories = await tx.rubricCategory.findMany({
          where: { eventId },
          select: { id: true, weight: true, parentCategoryId: true },
        });
        const parents = categories.filter((c) => c.parentCategoryId === null);
        const parentMap = new Map(parents.map((p) => [p.id, p.weight]));
        const childToParent = new Map<number, number>();
        for (const c of categories) {
          if (c.parentCategoryId !== null) childToParent.set(c.id, c.parentCategoryId);
        }

        const claimsWithScores = await tx.claim.findMany({
          where: { problem: { eventId }, rubricScores: { some: {} } },
          select: { id: true, rubricScores: { select: { round: true, score: true, rubricCategoryId: true } } },
        });
        for (const claim of claimsWithScores) {
          // Get the last round's scores
          const lastRound = Math.max(...claim.rubricScores.map((s) => s.round));
          const lastRoundScores = claim.rubricScores.filter((s) => s.round === lastRound);

          // Binary: YES count per parent category
          const parentYesCount = new Map<number, number>();
          const parentTotal = new Map<number, number>();
          for (const s of lastRoundScores) {
            const parentId = childToParent.get(s.rubricCategoryId);
            if (parentId !== undefined) {
              parentYesCount.set(parentId, (parentYesCount.get(parentId) ?? 0) + (s.score > 0 ? 1 : 0));
              parentTotal.set(parentId, (parentTotal.get(parentId) ?? 0) + 1);
            }
          }

          // Weighted binary score: each parent contributes (YES/total) * weight
          let finalScore = 0;
          for (const [parentId, weight] of parentMap) {
            const yesCount = parentYesCount.get(parentId) ?? 0;
            const total = parentTotal.get(parentId) ?? 1;
            finalScore += (yesCount / total) * weight;
          }

          await tx.claim.update({
            where: { id: claim.id },
            data: { finalScore: Math.round(finalScore), score: Math.round(finalScore) },
          });
        }
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

    if (nextStatus === 'CLOSED') {
      // Auto-issue certificates once judging + attendance are final: achievement
      // for the top 3 teams, participation for present members. Runs in the
      // background so the close response isn't blocked by ~50 PDF generations
      // and uploads; failures are logged and re-runnable via the backfill script.
      void issueCertificatesForEvent(prisma, eventId)
        .then((result) =>
          console.log(`Certificates issued for event ${eventId}: ${result.created} created, ${result.skipped} skipped`)
        )
        .catch((certErr) => console.error(`Certificate issuance failed for event ${eventId}:`, certErr));
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
