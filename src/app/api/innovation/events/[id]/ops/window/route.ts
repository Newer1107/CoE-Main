import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent } from '@/lib/hackathon-ops';

// PUT /api/innovation/events/[id]/ops/window
// Coordinator/admin: reopen registration and/or move the submission lock.
//   { registrationOpen?: boolean, submissionLockAt?: string | null (ISO) }
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    if (!Number.isInteger(eventId)) return errorRes('Invalid event id', [], 400);

    const event = await prisma.hackathonEvent.findUnique({
      where: { id: eventId },
      select: { coordinatorId: true, coordinators: { select: { userId: true } }, registrationOpen: true, submissionLockAt: true, status: true },
    });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);
    if (event.status === 'CLOSED') {
      return errorRes('Event is closed', ['Registration cannot be reopened for a closed event'], 400);
    }

    const body = (await req.json().catch(() => null)) as {
      registrationOpen?: boolean;
      submissionLockAt?: string | null;
    } | null;
    if (!body) return errorRes('Invalid request body', [], 400);

    const data: Record<string, unknown> = {};
    if (typeof body.registrationOpen === 'boolean') {
      data.registrationOpen = body.registrationOpen;
    }
    if (body.submissionLockAt !== undefined) {
      if (body.submissionLockAt === null) {
        data.submissionLockAt = null; // no lock at all
      } else {
        const when = new Date(body.submissionLockAt);
        if (Number.isNaN(when.getTime())) return errorRes('Invalid submission deadline', [], 400);
        if (when <= new Date()) {
          return errorRes('Deadline must be in the future', ['Pick a date/time after now'], 400);
        }
        data.submissionLockAt = when;
      }
    }
    if (Object.keys(data).length === 0) return errorRes('Nothing to update', [], 400);

    const updated = await prisma.hackathonEvent.update({
      where: { id: eventId },
      data,
      select: { id: true, registrationOpen: true, submissionLockAt: true },
    });

    return successRes(
      {
        registrationOpen: updated.registrationOpen,
        submissionLockAt: updated.submissionLockAt ? updated.submissionLockAt.toISOString() : null,
      },
      'Registration window updated'
    );
  } catch (err) {
    console.error('window update error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
