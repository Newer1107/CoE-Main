import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationSessionUploadLockUpdateSchema } from '@/lib/validators';

// GET /api/innovation/events/[id]/session-upload-locks
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { id } = await params;
    const eventId = Number(id);
    if (!Number.isInteger(eventId) || eventId <= 0) return errorRes('Invalid event id', [], 400);

    const event = await prisma.hackathonEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        totalSessions: true,
        sessionUploadLocks: {
          orderBy: { session: 'asc' },
          select: {
            session: true,
            isOpen: true,
            updatedAt: true,
            updatedBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!event) return errorRes('Hackathon event not found', [], 404);

    return successRes(event, 'Session upload locks retrieved successfully.');
  } catch (err) {
    console.error('Session upload locks GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// PATCH /api/innovation/events/[id]/session-upload-locks
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { id } = await params;
    const eventId = Number(id);
    if (!Number.isInteger(eventId) || eventId <= 0) return errorRes('Invalid event id', [], 400);

    const body = await req.json().catch(() => null) as { session?: unknown; isOpen?: unknown } | null;
    if (!body) return errorRes('Validation failed', ['Request body is required'], 400);

    const parsed = innovationSessionUploadLockUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    const event = await prisma.hackathonEvent.findUnique({
      where: { id: eventId },
      select: { id: true, totalSessions: true },
    });
    if (!event) return errorRes('Hackathon event not found', [], 404);

    if (parsed.data.session > event.totalSessions) {
      return errorRes('Invalid session', [`Session must be between 1 and ${event.totalSessions}`], 400);
    }

    const lock = await prisma.hackathonSessionUploadLock.upsert({
      where: {
        eventId_session: {
          eventId,
          session: parsed.data.session,
        },
      },
      update: {
        isOpen: parsed.data.isOpen,
        updatedByUserId: user.id,
      },
      create: {
        eventId,
        session: parsed.data.session,
        isOpen: parsed.data.isOpen,
        updatedByUserId: user.id,
      },
      select: {
        eventId: true,
        session: true,
        isOpen: true,
        updatedAt: true,
        updatedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return successRes(lock, 'Session upload lock updated successfully.');
  } catch (err) {
    console.error('Session upload locks PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
