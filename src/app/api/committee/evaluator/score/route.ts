import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { committeeEvaluatorScoreSchema } from '@/lib/committee-validators';
import { getActiveCommitteeEvent } from '@/lib/committee';

// POST /api/committee/evaluator/score
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'EVALUATOR')) return errorRes('Forbidden', ['Evaluator access required'], 403);

    const activeEvent = await getActiveCommitteeEvent();
    if (!activeEvent) return errorRes('No active committee event', [], 404);

    const body = await req.json();
    const parsed = committeeEvaluatorScoreSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const registration = await prisma.committeeRegistration.findUnique({
      where: { id: parsed.data.registrationId },
      select: { id: true, eventId: true },
    });
    if (!registration || registration.eventId !== activeEvent.id) {
      return errorRes('Registration not found for active event', [], 404);
    }

    const rubricItems = await prisma.committeeRubricItem.findMany({
      where: { eventId: activeEvent.id },
      select: { id: true, maxScore: true },
    });
    const rubricMap = new Map(rubricItems.map((item) => [item.id, item.maxScore]));

    const validationErrors: string[] = [];
    for (const scoreInput of parsed.data.scores) {
      const maxScore = rubricMap.get(scoreInput.rubricItemId);
      if (typeof maxScore === 'undefined') {
        validationErrors.push(`Rubric item ${scoreInput.rubricItemId} is not valid for active event.`);
        continue;
      }
      if (scoreInput.score > maxScore) {
        validationErrors.push(`Score for rubric item ${scoreInput.rubricItemId} cannot exceed ${maxScore}.`);
      }
    }

    if (validationErrors.length > 0) return errorRes('Validation failed', validationErrors, 400);

    await prisma.$transaction(
      parsed.data.scores.map((scoreInput) =>
        prisma.committeeScore.upsert({
          where: {
            registrationId_rubricItemId_evaluatorId: {
              registrationId: parsed.data.registrationId,
              rubricItemId: scoreInput.rubricItemId,
              evaluatorId: user.id,
            },
          },
          create: {
            registrationId: parsed.data.registrationId,
            rubricItemId: scoreInput.rubricItemId,
            evaluatorId: user.id,
            score: scoreInput.score,
            feedback: scoreInput.feedback?.trim() || null,
          },
          update: {
            score: scoreInput.score,
            feedback: scoreInput.feedback?.trim() || null,
          },
        }),
      ),
    );

    const savedScores = await prisma.committeeScore.findMany({
      where: {
        registrationId: parsed.data.registrationId,
        evaluatorId: user.id,
      },
      orderBy: [{ rubricItemId: 'asc' }],
    });

    return successRes(savedScores, 'Scores submitted successfully.');
  } catch (err) {
    console.error('Committee evaluator score POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
