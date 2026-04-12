import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { getActiveCommitteeEvent } from '@/lib/committee';

// GET /api/committee/event
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT', 'EVALUATOR', 'ADMIN')) return errorRes('Forbidden', [], 403);

    const activeEvent = await getActiveCommitteeEvent();
    if (!activeEvent) return successRes(null, 'No active committee event.');

    const [tracks, rubricItems] = await Promise.all([
      prisma.committeeTrack.findMany({
        where: { eventId: activeEvent.id },
        orderBy: { id: 'asc' },
        include: {
          _count: {
            select: { registrations: true },
          },
        },
      }),
      prisma.committeeRubricItem.findMany({
        where: { eventId: activeEvent.id },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return successRes(
      {
        ...activeEvent,
        tracks,
        rubricItems,
      },
      'Committee event retrieved successfully.',
    );
  } catch (err) {
    console.error('Committee event GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
