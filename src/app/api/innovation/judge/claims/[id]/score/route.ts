import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canJudgeClaim, currentRound, findJudgeAssignment } from '@/lib/hackathon-ops';

// POST /api/innovation/judge/claims/[id]/score
// { rubricValues: { [categoryId]: score }, comment?: string }
// Writes round-scoped rows (upsert per category); caps at category weight.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const claimId = Number((await params).id);
    const body = await req.json().catch(() => null);
    const rubricValues = (body?.rubricValues ?? {}) as Record<string, number>;
    const comment = ((body?.comment ?? '') as string).trim().slice(0, 1000) || null;

    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      include: { problem: { select: { eventId: true } } },
    });
    if (!claim) return errorRes('Claim not found', [], 404);
    const eventId = claim.problem.eventId;
    if (!eventId) return errorRes('Claim has no event', [], 404);

    const assignment = await findJudgeAssignment(user.id, eventId);
    if (!assignment) return errorRes('Not assigned', ['You are not assigned to judge this event'], 403);
    if (!canJudgeClaim(assignment, claim.venueId)) {
      return errorRes('Out of scope', ['This team is not in your assigned venue'], 403);
    }

    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
    if (!event || event.status !== 'JUDGING') {
      return errorRes('Judging is not open', [], 403);
    }
    const round = currentRound(event);

    const categoryIds = Object.keys(rubricValues).map(Number).filter(Number.isInteger);
    if (categoryIds.length === 0) return errorRes('No scores provided', [], 400);
    const categories = await prisma.rubricCategory.findMany({
      where: { id: { in: categoryIds }, eventId },
    });
    if (categories.length !== categoryIds.length) return errorRes('Invalid rubric category', [], 400);

    for (const category of categories) {
      const score = Number(rubricValues[category.id]);
      if (!Number.isInteger(score) || score < 0 || score > category.weight) {
        return errorRes('Invalid score', [`Score for “${category.label}” must be 0–${category.weight}`], 400);
      }
    }

    await prisma.$transaction(
      categories.map((category) =>
        prisma.rubricScore.upsert({
          where: { claimId_rubricCategoryId_round: { claimId, rubricCategoryId: category.id, round } },
          update: { score: Number(rubricValues[category.id]), comment },
          create: {
            claimId,
            rubricCategoryId: category.id,
            score: Number(rubricValues[category.id]),
            comment,
            round,
          },
        }),
      ),
    );

    return successRes({ claimId, round }, 'Scores saved');
  } catch (err) {
    console.error('judge score error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
