import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationBulkClaimDecisionSchema } from '@/lib/validators';
import { sendInnovationRubricScoreEmail, sendInnovationScreeningResultEmail } from '@/lib/mailer';
import { calculateWeightedHackathonScore, HackathonRubricScores } from '@/lib/hackathon-scoring';

// PATCH /api/innovation/faculty/claims/sync
export async function PATCH(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'FACULTY', 'ADMIN')) return errorRes('Forbidden', ['Faculty or admin access required'], 403);

    const body = await req.json();
    const parsed = innovationBulkClaimDecisionSchema.safeParse(body);
    if (!parsed.success) {
      return errorRes(
        'Validation failed',
        parsed.error.issues.map((issue) => issue.message),
        400
      );
    }

    const stage = parsed.data.stage;
    const unique = new Map<number, { status: 'SHORTLISTED' | 'ACCEPTED' | 'REJECTED'; rubrics?: HackathonRubricScores; finalScore?: number }>();
    for (const row of parsed.data.decisions) {
      if (stage === 'SCREENING') {
        unique.set(row.claimId, {
          status: row.status,
        });
        continue;
      }

      if (!row.rubrics) {
        return errorRes('Validation failed', ['Rubric scores are required for judging sync'], 400);
      }

      const rubrics: HackathonRubricScores = {
        innovation: row.rubrics.innovation,
        technical: row.rubrics.technical,
        impact: row.rubrics.impact,
        ux: row.rubrics.ux,
        execution: row.rubrics.execution,
        presentation: row.rubrics.presentation,
        feasibility: row.rubrics.feasibility,
      };

      unique.set(row.claimId, {
        status: row.status,
        rubrics,
        finalScore: calculateWeightedHackathonScore(rubrics),
      });
    }

    const claimIds = Array.from(unique.keys());

    const claims = await prisma.claim.findMany({
      where: { id: { in: claimIds } },
      include: {
        problem: {
          include: {
            event: { select: { id: true, title: true, status: true } },
          },
        },
        members: {
          include: {
            user: { select: { email: true } },
          },
        },
      },
    });

    if (claims.length !== claimIds.length) {
      const found = new Set(claims.map((claim) => claim.id));
      const missing = claimIds.filter((id) => !found.has(id));
      return errorRes('Invalid claims', [`Claim ids not found: ${missing.join(', ')}`], 404);
    }

    if (!authorize(user, 'ADMIN')) {
      const unauthorized = claims.find((claim) => claim.problem.createdById !== user.id);
      if (unauthorized) {
        return errorRes('Forbidden', ['You can only sync decisions for your own problem submissions'], 403);
      }
    }

    const allowedStates = stage === 'SCREENING' ? ['IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED'] : ['SHORTLISTED'];
    const invalidState = claims.find((claim) => !allowedStates.includes(claim.status));
    if (invalidState) {
      return errorRes(
        'Invalid claim state',
        [`Claim #${invalidState.id} is in ${invalidState.status} and cannot be synced in ${stage.toLowerCase()} stage`],
        400
      );
    }

    if (typeof parsed.data.eventId !== 'undefined') {
      const outOfEvent = claims.find((claim) => claim.problem.event?.id !== parsed.data.eventId);
      if (outOfEvent) {
        return errorRes('Invalid claim set', ['All selected submissions must belong to the chosen hackathon event'], 400);
      }
    }

    const nonHackathonClaim = claims.find((claim) => !claim.problem.event);
    if (nonHackathonClaim) {
      return errorRes('Invalid claim set', ['Bulk sync is only available for hackathon event submissions'], 400);
    }

    if (stage === 'JUDGING') {
      const invalidJudgingEvent = claims.find((claim) => claim.problem.event?.status !== 'JUDGING');
      if (invalidJudgingEvent) {
        return errorRes('Invalid event stage', ['Final judging sync is allowed only when event status is JUDGING'], 400);
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const claim of claims) {
        const decision = unique.get(claim.id);
        if (!decision) continue;

        await tx.claim.update({
          where: { id: claim.id },
          data: {
            status: decision.status,
            innovationScore: stage === 'JUDGING' ? decision.rubrics?.innovation : null,
            technicalScore: stage === 'JUDGING' ? decision.rubrics?.technical : null,
            impactScore: stage === 'JUDGING' ? decision.rubrics?.impact : null,
            uxScore: stage === 'JUDGING' ? decision.rubrics?.ux : null,
            executionScore: stage === 'JUDGING' ? decision.rubrics?.execution : null,
            presentationScore: stage === 'JUDGING' ? decision.rubrics?.presentation : null,
            feasibilityScore: stage === 'JUDGING' ? decision.rubrics?.feasibility : null,
            finalScore: stage === 'JUDGING' ? decision.finalScore : null,
            score: stage === 'JUDGING' ? decision.finalScore : null,
          } as Prisma.ClaimUncheckedUpdateInput,
        });

        if (stage === 'JUDGING' && decision.status === 'ACCEPTED' && claim.problem.mode === 'CLOSED') {
          await tx.problem.update({
            where: { id: claim.problemId },
            data: { status: 'SOLVED' },
          });
        }
      }
    });

    for (const claim of claims) {
      const decision = unique.get(claim.id);
      if (!decision) continue;

      const recipientEmails = Array.from(new Set(claim.members.map((member) => member.user.email)));
      if (recipientEmails.length === 0) continue;

      try {
        if (stage === 'SCREENING') {
          if (decision.status === 'SHORTLISTED' || decision.status === 'REJECTED') {
            await sendInnovationScreeningResultEmail(recipientEmails, {
              eventTitle: claim.problem.event?.title || 'Hackathon Event',
              problemTitle: claim.problem.title,
              status: decision.status,
            });
          }
        } else {
          if (!decision.rubrics || typeof decision.finalScore !== 'number') continue;
          if (decision.status !== 'ACCEPTED' && decision.status !== 'REJECTED') continue;
          await sendInnovationRubricScoreEmail(recipientEmails, {
            eventTitle: claim.problem.event?.title || 'Hackathon Event',
            problemTitle: claim.problem.title,
            status: decision.status,
            rubrics: decision.rubrics,
            finalScore: decision.finalScore,
          });
        }
      } catch (mailErr) {
        console.error(`Bulk sync email failed for claim #${claim.id}:`, mailErr);
      }
    }

    if (stage === 'SCREENING') {
      const shortlisted = Array.from(unique.values()).filter((item) => item.status === 'SHORTLISTED').length;
      const rejected = Array.from(unique.values()).filter((item) => item.status === 'REJECTED').length;
      return successRes(
        { total: unique.size, shortlisted, rejected },
        'PPT screening decisions synced and participant emails dispatched.'
      );
    }

    const accepted = Array.from(unique.values()).filter((item) => item.status === 'ACCEPTED').length;
    const rejected = Array.from(unique.values()).filter((item) => item.status === 'REJECTED').length;
    return successRes(
      { total: unique.size, accepted, rejected },
      'Final judging decisions synced and participant emails dispatched.'
    );
  } catch (err) {
    console.error('Innovation faculty claims sync PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
