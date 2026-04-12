import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { getActiveCommitteeEvent } from '@/lib/committee';

// GET /api/committee/admin/results
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const activeEvent = await getActiveCommitteeEvent();
    if (!activeEvent) return errorRes('No active committee event', [], 404);

    const [rubricItems, registrations] = await Promise.all([
      prisma.committeeRubricItem.findMany({
        where: { eventId: activeEvent.id },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      }),
      prisma.committeeRegistration.findMany({
        where: { eventId: activeEvent.id },
        orderBy: [{ trackId: 'asc' }, { createdAt: 'asc' }],
        include: {
          user: { select: { id: true, name: true, email: true } },
          track: { select: { id: true, name: true, room: true } },
          scores: {
            include: {
              rubricItem: { select: { id: true, label: true, maxScore: true, weight: true, order: true } },
              evaluator: { select: { id: true, name: true, email: true } },
            },
            orderBy: [{ rubricItem: { order: 'asc' } }, { evaluatorId: 'asc' }],
          },
        },
      }),
    ]);

    const rows = registrations.map((registration) => {
      const scoreGroups = new Map<number, number[]>();
      for (const scoreRow of registration.scores) {
        const existing = scoreGroups.get(scoreRow.rubricItemId) || [];
        existing.push(scoreRow.score);
        scoreGroups.set(scoreRow.rubricItemId, existing);
      }

      const totalWeight = rubricItems.reduce((sum, item) => sum + item.weight, 0);
      const allRubricsScored =
        rubricItems.length > 0 &&
        rubricItems.every((item) => {
          const values = scoreGroups.get(item.id);
          return Boolean(values && values.length > 0);
        });

      let weightedSum = 0;
      for (const item of rubricItems) {
        const values = scoreGroups.get(item.id) || [];
        if (values.length === 0) continue;
        const average = values.reduce((sum, value) => sum + value, 0) / values.length;
        weightedSum += (average / item.maxScore) * item.weight;
      }

      const weightedPercentage = totalWeight > 0 ? Number(((weightedSum / totalWeight) * 100).toFixed(2)) : 0;
      return {
        registrationId: registration.id,
        student: registration.user,
        track: registration.track,
        totalScore: weightedPercentage,
        weightedPercentage,
        allRubricsScored,
        scores: registration.scores.map((scoreRow) => ({
          id: scoreRow.id,
          rubricItemId: scoreRow.rubricItemId,
          rubricItemLabel: scoreRow.rubricItem.label,
          rubricItemOrder: scoreRow.rubricItem.order,
          maxScore: scoreRow.rubricItem.maxScore,
          weight: scoreRow.rubricItem.weight,
          score: scoreRow.score,
          feedback: scoreRow.feedback,
          evaluator: scoreRow.evaluator,
          createdAt: scoreRow.createdAt,
        })),
      };
    });

    return successRes(
      {
        event: activeEvent,
        rubricItems,
        registrations: rows,
      },
      'Committee admin results retrieved successfully.',
    );
  } catch (err) {
    console.error('Committee admin results GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
