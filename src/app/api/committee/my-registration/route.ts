import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { getActiveCommitteeEvent } from '@/lib/committee';

// GET /api/committee/my-registration
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const activeEvent = await getActiveCommitteeEvent();
    if (!activeEvent) return errorRes('No active committee event', [], 404);

    const registration = await prisma.committeeRegistration.findUnique({
      where: {
        eventId_userId: {
          eventId: activeEvent.id,
          userId: user.id,
        },
      },
      include: {
        track: {
          select: {
            id: true,
            name: true,
            room: true,
          },
        },
        scores: {
          include: {
            rubricItem: {
              select: {
                id: true,
                maxScore: true,
                weight: true,
              },
            },
          },
        },
      },
    });

    if (!registration) return errorRes('Committee registration not found', [], 404);

    const rubricItems = await prisma.committeeRubricItem.findMany({
      where: { eventId: activeEvent.id },
      select: { id: true, maxScore: true, weight: true },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });

    const scoreGroups = new Map<number, number[]>();
    for (const scoreRow of registration.scores) {
      const values = scoreGroups.get(scoreRow.rubricItemId) || [];
      values.push(scoreRow.score);
      scoreGroups.set(scoreRow.rubricItemId, values);
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

    const weightedPercentage = totalWeight > 0 ? Number(((weightedSum / totalWeight) * 100).toFixed(2)) : null;

    return successRes(
      {
        id: registration.id,
        eventId: activeEvent.id,
        eventTitle: activeEvent.title,
        track: registration.track,
        createdAt: registration.createdAt,
        evaluation: {
          allRubricsScored,
          weightedPercentage,
        },
      },
      'Committee registration retrieved successfully.',
    );
  } catch (err) {
    console.error('Committee my-registration GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
