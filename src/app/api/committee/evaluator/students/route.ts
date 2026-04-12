import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { getActiveCommitteeEvent } from '@/lib/committee';

// GET /api/committee/evaluator/students
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'EVALUATOR')) return errorRes('Forbidden', ['Evaluator access required'], 403);

    const activeEvent = await getActiveCommitteeEvent();
    if (!activeEvent) return errorRes('No active committee event', [], 404);

    const [rubricItems, tracks] = await Promise.all([
      prisma.committeeRubricItem.findMany({
        where: { eventId: activeEvent.id },
        select: {
          id: true,
          label: true,
          maxScore: true,
          weight: true,
          order: true,
          createdAt: true,
          eventId: true,
        },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      }),
      prisma.committeeTrack.findMany({
        where: { eventId: activeEvent.id },
        orderBy: [{ id: 'asc' }],
        include: {
          registrations: {
            orderBy: [{ createdAt: 'asc' }],
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              scores: {
                where: { evaluatorId: user.id },
                select: {
                  id: true,
                  rubricItemId: true,
                  score: true,
                  feedback: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const grouped = tracks.map((track) => ({
      id: track.id,
      name: track.name,
      room: track.room,
      students: track.registrations.map((registration) => ({
        registrationId: registration.id,
        userId: registration.user.id,
        name: registration.user.name,
        email: registration.user.email,
        scored: rubricItems.length > 0 && registration.scores.length >= rubricItems.length,
        scores: registration.scores,
      })),
    }));

    return successRes(
      {
        event: {
          id: activeEvent.id,
          title: activeEvent.title,
        },
        rubricItems,
        tracks: grouped,
      },
      'Committee evaluator students retrieved successfully.',
    );
  } catch (err) {
    console.error('Committee evaluator students GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
