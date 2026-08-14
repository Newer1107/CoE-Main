import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent } from '@/lib/hackathon-ops';

// GET /events/[id]/feedback — manager: all rows; others: their own submission
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);

    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId }, select: { coordinatorId: true } });
    if (!event) return errorRes('Event not found', [], 404);
    if (canManageEvent(user, event)) {
      const rows = await prisma.eventFeedback.findMany({
        where: { eventId },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return successRes({ rows });
    }
    const mine = await prisma.eventFeedback.findUnique({
      where: { eventId_userId: { eventId, userId: user.id } },
    });
    return successRes({ mine });
  } catch (err) {
    console.error('feedback GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// POST — student submits feedback { rating: 1-5, comment? } once; event must be CLOSED + ops.feedback on
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const body = await req.json().catch(() => null);
    const rating = Number(body?.rating);
    const comment = ((body?.comment ?? '') as string).trim().slice(0, 2000);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return errorRes('Invalid rating', ['Rating must be between 1 and 5'], 400);
    }

    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
    if (!event) return errorRes('Event not found', [], 404);
    const cfg = ((event.config ?? {}) as { ops?: { feedback?: boolean } }).ops ?? {};
    if (!cfg.feedback) return errorRes('Feedback is not open for this event', [], 403);
    if (event.status !== 'CLOSED') {
      return errorRes('Feedback opens after results', ['You can leave feedback once the event closes'], 403);
    }

    const existing = await prisma.eventFeedback.findUnique({
      where: { eventId_userId: { eventId, userId: user.id } },
    });
    if (existing) return errorRes('Already submitted', ['You have already left feedback for this event'], 409);

    const row = await prisma.eventFeedback.create({
      data: { eventId, userId: user.id, rating, comment: comment || null },
    });
    return successRes({ feedback: row }, 'Feedback submitted', 201);
  } catch (err) {
    console.error('feedback POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
