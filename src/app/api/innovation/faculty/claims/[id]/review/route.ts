import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationClaimReviewSchema } from '@/lib/validators';
import { sendInnovationClaimReviewEmail } from '@/lib/mailer';

// PATCH /api/innovation/faculty/claims/[id]/review
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'FACULTY', 'ADMIN')) return errorRes('Forbidden', ['Faculty or admin access required'], 403);

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

    if (!authorize(user, 'ADMIN') && claim.problem.createdById !== user.id) {
      return errorRes('Forbidden', ['You can only review claims for your own problems'], 403);
    }

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
          data: { status: 'SOLVED' },
        });
      }

      return result;
    });

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
