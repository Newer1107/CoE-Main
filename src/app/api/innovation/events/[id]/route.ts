import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationEventUpdateSchema } from '@/lib/validators';
import { canTransitionEventStatus } from '@/lib/innovation';

// PATCH /api/innovation/events/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN', 'FACULTY')) return errorRes('Forbidden', ['Faculty or admin access required'], 403);

    const { id } = await params;
    const eventId = Number(id);
    if (!Number.isInteger(eventId) || eventId <= 0) return errorRes('Invalid event id', [], 400);

    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
    if (!event) return errorRes('Hackathon event not found', [], 404);

    if (!authorize(user, 'ADMIN') && event.createdById !== user.id) {
      return errorRes('Forbidden', ['You can only modify events you created'], 403);
    }

    const body = await req.json();
    const parsed = innovationEventUpdateSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    if (typeof parsed.data.status !== 'undefined' && !authorize(user, 'ADMIN')) {
      return errorRes('Forbidden', ['Only admin can change event status'], 403);
    }

    const updateData: Record<string, unknown> = {};
    if (typeof parsed.data.title !== 'undefined') updateData.title = parsed.data.title;
    if (typeof parsed.data.description !== 'undefined') updateData.description = parsed.data.description || null;
    if (typeof parsed.data.startTime !== 'undefined') updateData.startTime = new Date(parsed.data.startTime);
    if (typeof parsed.data.endTime !== 'undefined') updateData.endTime = new Date(parsed.data.endTime);
    if (typeof parsed.data.registrationOpen !== 'undefined') updateData.registrationOpen = parsed.data.registrationOpen;

    const nextStart = (updateData.startTime as Date | undefined) ?? event.startTime;
    const nextEnd = (updateData.endTime as Date | undefined) ?? event.endTime;
    if (nextEnd <= nextStart) return errorRes('Invalid event timing', ['endTime must be after startTime'], 400);

    if (typeof parsed.data.status !== 'undefined' && parsed.data.status !== event.status) {
      if (!canTransitionEventStatus(event.status, parsed.data.status)) {
        return errorRes('Invalid status transition', [`${event.status} can only transition to the next state`], 400);
      }
      updateData.status = parsed.data.status;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.hackathonEvent.update({ where: { id: eventId }, data: updateData });
    }

    const updated = await prisma.hackathonEvent.findUnique({
      where: { id: eventId },
      include: {
        _count: { select: { problems: true } },
        problems: { select: { id: true, title: true, status: true, mode: true } },
      },
    });

    return successRes(updated, 'Hackathon event updated successfully.');
  } catch (err) {
    console.error('Innovation events PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
