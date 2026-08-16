import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent } from '@/lib/hackathon-ops';
import { createNotifications } from '@/lib/notifications';

// PUT /api/innovation/events/[id]/ops/problem
// Coordinator: change a team's problem statement.
//   { claimId: number, problemId: number }
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    if (!Number.isInteger(eventId)) return errorRes('Invalid event id', [], 400);

    const event = await prisma.hackathonEvent.findUnique({
      where: { id: eventId },
      select: {
        title: true,
        status: true,
        coordinatorId: true,
        coordinators: { select: { userId: true } },
      },
    });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);
    if (event.status === 'CLOSED') return errorRes('Event is closed', ['Problem statements cannot change after close'], 400);

    const body = (await req.json().catch(() => null)) as { claimId?: number; problemId?: number } | null;
    if (!body || !Number.isInteger(body.claimId) || !Number.isInteger(body.problemId)) {
      return errorRes('claimId and problemId are required', [], 400);
    }

    const claim = await prisma.claim.findUnique({
      where: { id: body.claimId },
      include: {
        problem: { select: { id: true, title: true, eventId: true } },
        members: { select: { userId: true } },
      },
    });
    if (!claim || claim.problem?.eventId !== eventId) {
      return errorRes('Claim not found for this event', [], 404);
    }

    const newProblem = await prisma.problem.findFirst({ where: { id: body.problemId, eventId } });
    if (!newProblem) return errorRes('Problem statement not found for this event', [], 404);

    await prisma.claim.update({ where: { id: claim.id }, data: { problemId: newProblem.id } });

    if (claim.members.length > 0) {
      await createNotifications(
        claim.members.map((m) => ({
          userId: m.userId,
          type: 'EVENT_UPDATE' as const,
          title: `Problem statement changed — ${event.title}`,
          body: `Your team's problem statement is now: ${newProblem.title}`,
        }))
      );
    }

    return successRes(
      { claimId: claim.id, problemId: newProblem.id, title: newProblem.title },
      `Problem statement changed — team notified`
    );
  } catch (err) {
    console.error('problem change error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
