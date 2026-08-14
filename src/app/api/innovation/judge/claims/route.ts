import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canJudgeClaim, currentRound, findJudgeAssignment, opsConfig } from '@/lib/hackathon-ops';

// GET /api/innovation/judge/claims?eventId=N
// The judge's scoped queue: claims in their venue (or all when venueId null),
// rubric categories, existing scores for the CURRENT round, and round info.
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number(req.nextUrl.searchParams.get('eventId'));
    if (!Number.isInteger(eventId)) return errorRes('eventId is required', [], 400);

    const assignment = await findJudgeAssignment(user.id, eventId);
    if (!assignment) return errorRes('Not assigned', ['You are not assigned to judge this event'], 403);

    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
    if (!event) return errorRes('Event not found', [], 404);
    if (event.status !== 'JUDGING') {
      return errorRes('Judging is not open', [`Event status is ${event.status}`], 403);
    }

    const cfg = opsConfig(event);
    const round = currentRound(event);
    const venueId = assignment.venueId ?? null;

    const [categories, claims] = await Promise.all([
      prisma.rubricCategory.findMany({ where: { eventId }, orderBy: { order: 'asc' } }),
      prisma.claim.findMany({
        where: { problem: { eventId }, ...(venueId ? { venueId } : {}) },
        include: {
          venue: { select: { id: true, name: true } },
          problem: { select: { id: true, title: true } },
          members: { include: { user: { select: { name: true, email: true, uid: true } } } },
          rubricScores: { where: { round }, include: { rubricCategory: true } },
        },
        orderBy: { id: 'asc' },
      }),
    ]);

    const scoped = claims.filter((claim) => canJudgeClaim(assignment, claim.venueId));
    return successRes({
      event: { id: event.id, title: event.title, status: event.status },
      round,
      maxRound: Math.max(1, cfg.judgeRounds ?? 1),
      venue: venueId
        ? await prisma.venue.findUnique({ where: { id: venueId }, select: { id: true, name: true } })
        : null,
      categories,
      claims: scoped,
    });
  } catch (err) {
    console.error('judge claims error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
