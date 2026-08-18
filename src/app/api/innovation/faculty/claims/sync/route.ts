import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { processEmailQueue } from '@/lib/email-delivery';
import { innovationBulkClaimDecisionSchema } from '@/lib/validators';
import { sendInnovationRubricScoreEmail, sendInnovationScreeningResultEmail } from '@/lib/mailer';
import {
  calculateScoreFromRubrics,
  HackathonRubricScores,
  LEGACY_CATEGORIES,
  RubricCategoryConfig,
  validateRubricValues,
} from '@/lib/hackathon-scoring';
import { issueHackathonSelectionTicketsForClaim } from '@/lib/tickets';
import { logActivity } from '@/lib/activity-log';

// PATCH /api/innovation/faculty/claims/sync
export async function PATCH(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

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
    const unique = new Map<
      number,
      {
        status: 'SHORTLISTED' | 'ACCEPTED' | 'REJECTED';
        rubrics?: HackathonRubricScores;
        rubricValues?: Record<string, number>;
        rubricKeys?: string[];
        finalScore?: number;
      }
    >();
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

      // Legacy-shaped rubrics (for the fixed claim columns + email); raw values kept for
      // config-driven scoring once the event's RubricCategory rows are resolved below.
      const rubrics: HackathonRubricScores = {
        innovation: row.rubrics.innovation ?? 0,
        technical: row.rubrics.technical ?? 0,
        impact: row.rubrics.impact ?? 0,
        ux: row.rubrics.ux ?? 0,
        execution: row.rubrics.execution ?? 0,
        presentation: row.rubrics.presentation ?? 0,
        feasibility: row.rubrics.feasibility ?? 0,
      };

      unique.set(row.claimId, {
        status: row.status,
        rubrics,
        rubricValues: row.rubrics,
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
      const invalidJudgingEvent = claims.find((claim) => claim.problem.event?.status === 'UPCOMING');
      if (invalidJudgingEvent) {
        return errorRes('Invalid event stage', ['Final judging sync is not allowed while event status is UPCOMING'], 400);
      }

      const absentClaim = claims.find((claim) => claim.isAbsent);
      if (absentClaim) {
        return errorRes('Invalid claim state', [`Claim #${absentClaim.id} is marked absent. Mark the team present before judging sync.`], 400);
      }
    }

    // Config-driven judging: resolve each event's RubricCategory rows (falling back to the
    // legacy 7 categories), validate the submitted rubric values, and compute final scores.
    const eventCategories = new Map<number, RubricCategoryConfig[]>();
    if (stage === 'JUDGING') {
      const eventIds = Array.from(
        new Set(claims.map((claim) => claim.problem.event?.id).filter((id): id is number => typeof id === 'number'))
      );

      if (eventIds.length > 0) {
        const rubricRows = await prisma.rubricCategory.findMany({
          where: { eventId: { in: eventIds } },
          orderBy: [{ parentCategoryId: 'asc' }, { order: 'asc' }],
          select: { id: true, eventId: true, key: true, label: true, weight: true },
        });

        for (const eventId of eventIds) {
          const rows = rubricRows.filter((row) => row.eventId === eventId);
          eventCategories.set(eventId, rows.length > 0 ? rows : LEGACY_CATEGORIES);
        }
      }

      for (const claim of claims) {
        const decision = unique.get(claim.id);
        if (!decision) continue;

        const eventId = claim.problem.event?.id;
        if (typeof eventId !== 'number') continue;

        const categories = eventCategories.get(eventId) ?? LEGACY_CATEGORIES;

        if (!decision.rubricValues) {
          return errorRes('Validation failed', ['Rubric scores are required for judging sync'], 400);
        }

        const validationErrors = validateRubricValues(decision.rubricValues, categories);
        if (validationErrors) {
          return errorRes('Validation failed', validationErrors, 400);
        }

        decision.finalScore = calculateScoreFromRubrics(decision.rubricValues, categories);
        decision.rubricKeys = categories.map((category) => category.key);
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
            isAbsent: stage === 'JUDGING' ? false : claim.isAbsent,
            innovationScore: stage === 'JUDGING' ? (decision.rubricKeys?.includes('innovation') ? decision.rubrics?.innovation : null) : null,
            technicalScore: stage === 'JUDGING' ? (decision.rubricKeys?.includes('technical') ? decision.rubrics?.technical : null) : null,
            impactScore: stage === 'JUDGING' ? (decision.rubricKeys?.includes('impact') ? decision.rubrics?.impact : null) : null,
            uxScore: stage === 'JUDGING' ? (decision.rubricKeys?.includes('ux') ? decision.rubrics?.ux : null) : null,
            executionScore: stage === 'JUDGING' ? (decision.rubricKeys?.includes('execution') ? decision.rubrics?.execution : null) : null,
            presentationScore: stage === 'JUDGING' ? (decision.rubricKeys?.includes('presentation') ? decision.rubrics?.presentation : null) : null,
            feasibilityScore: stage === 'JUDGING' ? (decision.rubricKeys?.includes('feasibility') ? decision.rubrics?.feasibility : null) : null,
            finalScore: stage === 'JUDGING' ? decision.finalScore : null,
            score: stage === 'JUDGING' ? decision.finalScore : null,
          } as Prisma.ClaimUncheckedUpdateInput,
        });

        // Persist per-category scores for events with RubricCategory rows (legacy events
        // have no rows, so their scores keep living in the fixed claim columns above).
        if (stage === 'JUDGING' && decision.rubricValues) {
          const eventId = claim.problem.event?.id;
          const categories = typeof eventId === 'number' ? eventCategories.get(eventId) : undefined;
          if (categories) {
            for (const category of categories) {
              if (typeof category.id !== 'number') continue;
              const score = decision.rubricValues[category.key];
              if (typeof score !== 'number') continue;
              await tx.rubricScore.upsert({
                where: {
                  claimId_rubricCategoryId_round: {
                    claimId: claim.id,
                    rubricCategoryId: category.id,
                    round: 1,
                  },
                },
                update: { score },
                create: { claimId: claim.id, rubricCategoryId: category.id, score, round: 1 },
              });
            }
          }
        }

        if (stage === 'JUDGING' && decision.status === 'ACCEPTED' && claim.problem.mode === 'CLOSED') {
          await tx.problem.update({
            where: { id: claim.problemId },
            data: { status: 'CLOSED' },
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

    const ticketFailures: string[] = [];
    if (stage === 'SCREENING') {
      for (const claim of claims) {
        const decision = unique.get(claim.id);
        if (!decision || decision.status !== 'SHORTLISTED') continue;

        try {
          await issueHackathonSelectionTicketsForClaim(claim.id);
        } catch (ticketErr) {
          const msg = ticketErr instanceof Error ? ticketErr.message : 'UNKNOWN_ERROR';
          ticketFailures.push(`Claim #${claim.id}: ${msg}`);
          logActivity('HACKATHON_TICKET_ISSUE_FAILED', {
            claimId: claim.id,
            reviewerId: user.id,
            error: msg,
          });
        }
      }
    }

    try {
      await processEmailQueue(50);
    } catch (queueErr) {
      console.error('Email queue drain after claim sync failed:', queueErr);
    }

    if (ticketFailures.length > 0) {
      return errorRes('Ticket issuance failed for shortlisted claims', ticketFailures, 500);
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
