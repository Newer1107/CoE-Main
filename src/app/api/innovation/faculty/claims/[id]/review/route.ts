import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationClaimReviewSchema } from '@/lib/validators';
import { sendInnovationClaimReviewEmail } from '@/lib/mailer';
import { issueHackathonSelectionTicketsForClaim } from '@/lib/tickets';
import { logActivity } from '@/lib/activity-log';

// PATCH /api/innovation/faculty/claims/[id]/review
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { id } = await params;
    const claimId = Number(id);
    if (!Number.isInteger(claimId) || claimId <= 0) return errorRes('Invalid claim id', [], 400);

    const body = await req.json();
    const parsed = innovationClaimReviewSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      include: {
        problem: {
          include: {
            createdBy: { select: { id: true, email: true } },
          },
        },
        members: {
          include: {
            user: { select: { email: true } },
          },
        },
      },
    });

    if (!claim) return errorRes('Claim not found', [], 404);

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.claim.update({
        where: { id: claimId },
        data: {
          status: parsed.data.status,
          score: parsed.data.score,
          feedback: parsed.data.feedback || null,
          badges: parsed.data.badges || null,
        },
      });

      if (parsed.data.status === 'ACCEPTED' && claim.problem.mode === 'CLOSED') {
        await tx.problem.update({
          where: { id: claim.problemId },
          data: { status: 'CLOSED' },
        });
      }

      return result;
    });

    if (parsed.data.status === 'ACCEPTED' && claim.problem.eventId) {
      try {
        await issueHackathonSelectionTicketsForClaim(claim.id);
      } catch (ticketErr) {
        console.error('Hackathon ticket issuance failed after claim acceptance:', ticketErr);
        logActivity('HACKATHON_TICKET_ISSUE_FAILED', {
          claimId: claim.id,
          problemId: claim.problemId,
          reviewerId: user.id,
          error: ticketErr instanceof Error ? ticketErr.message : 'UNKNOWN_ERROR',
        });
        return errorRes(
          'Claim accepted but ticket issuance failed.',
          ['Ticket generation failed for one or more participants.'],
          500
        );
      }
    }

    const recipientEmails = Array.from(new Set(claim.members.map((member) => member.user.email)));
    if (recipientEmails.length > 0) {
      try {
        await sendInnovationClaimReviewEmail(recipientEmails, {
          problemTitle: claim.problem.title,
          status: parsed.data.status,
          score: parsed.data.score,
          feedback: parsed.data.feedback,
        });
      } catch (mailErr) {
        console.error('Innovation review email failed:', mailErr);
      }
    }

    return successRes(updated, 'Claim review saved.');
  } catch (err) {
    console.error('Innovation faculty review PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
