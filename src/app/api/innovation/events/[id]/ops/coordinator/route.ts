import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent } from '@/lib/hackathon-ops';

// GET  /ops/coordinator — event coordinator + candidate teachers (event manager)
// PUT  /ops/coordinator — set/clear the event coordinator { coordinatorId: number | null } (admin only)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const event = await prisma.hackathonEvent.findUnique({
      where: { id: eventId },
      select: { coordinatorId: true, coordinator: { select: { id: true, name: true, email: true } } },
    });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);

    const faculty = user.role === 'ADMIN'
      ? await prisma.user.findMany({
          where: { role: { in: ['FACULTY', 'ADMIN'] }, status: 'ACTIVE' },
          select: { id: true, name: true, email: true, role: true },
          orderBy: { name: 'asc' },
        })
      : [];
    return successRes({ coordinator: event.coordinator, faculty });
  } catch (err) {
    console.error('coordinator GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (user.role !== 'ADMIN') return errorRes('Admins only', [], 403);
    const eventId = Number((await params).id);
    const body = await req.json().catch(() => null);
    const coordinatorId = body?.coordinatorId == null || body?.coordinatorId === '' ? null : Number(body?.coordinatorId);

    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
    if (!event) return errorRes('Event not found', [], 404);

    if (coordinatorId !== null) {
      const teacher = await prisma.user.findFirst({ where: { id: coordinatorId, role: { in: ['FACULTY', 'ADMIN'] } } });
      if (!teacher) return errorRes('Teacher not found', ['Pick a FACULTY or ADMIN user'], 400);
    }

    const updated = await prisma.hackathonEvent.update({
      where: { id: eventId },
      data: { coordinatorId },
      select: { id: true, coordinatorId: true },
    });
    return successRes({ coordinatorId: updated.coordinatorId }, coordinatorId ? 'Coordinator assigned' : 'Coordinator removed');
  } catch (err) {
    console.error('coordinator PUT error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
