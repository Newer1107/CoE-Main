import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent } from '@/lib/hackathon-ops';

// GET  /ops/coordinator — event coordinators + candidate teachers (event manager)
// PUT  /ops/coordinator — add a coordinator { coordinatorId: number } (admin only)
// DELETE /ops/coordinator — remove a coordinator { coordinatorId: number } (admin only)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const event = await prisma.hackathonEvent.findUnique({
      where: { id: eventId },
      select: {
        coordinatorId: true,
        coordinators: { select: { userId: true } },
        coordinator: { select: { id: true, name: true, email: true } },
      },
    });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);

    const coordinatorIds = event.coordinators.map((c) => c.userId);
    if (event.coordinator && !coordinatorIds.includes(event.coordinator.id)) {
      coordinatorIds.unshift(event.coordinator.id);
    }
    const coordinators = coordinatorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: coordinatorIds } },
          select: { id: true, name: true, email: true },
          orderBy: { name: 'asc' },
        })
      : [];

    const faculty = user.role === 'ADMIN'
      ? await prisma.user.findMany({
          where: { role: { in: ['FACULTY', 'ADMIN'] }, status: 'ACTIVE' },
          select: { id: true, name: true, email: true, role: true },
          orderBy: { name: 'asc' },
        })
      : [];
    return successRes({ coordinators, faculty });
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
    if (coordinatorId === null) return errorRes('coordinatorId is required', [], 400);

    const teacher = await prisma.user.findFirst({ where: { id: coordinatorId, role: { in: ['FACULTY', 'ADMIN'] } } });
    if (!teacher) return errorRes('Teacher not found', ['Pick a FACULTY or ADMIN user'], 400);

    await prisma.eventCoordinator.upsert({
      where: { eventId_userId: { eventId, userId: coordinatorId } },
      update: {},
      create: { eventId, userId: coordinatorId },
    });
    // keep the legacy single-coordinator column warm (first coordinator = primary)
    if (!event.coordinatorId) {
      await prisma.hackathonEvent.update({ where: { id: eventId }, data: { coordinatorId } });
    }
    return successRes({ coordinatorId }, 'Coordinator added');
  } catch (err) {
    console.error('coordinator PUT error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (user.role !== 'ADMIN') return errorRes('Admins only', [], 403);
    const eventId = Number((await params).id);
    const body = await req.json().catch(() => null);
    const coordinatorId = Number(body?.coordinatorId);
    if (!Number.isInteger(coordinatorId)) return errorRes('coordinatorId is required', [], 400);

    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
    if (!event) return errorRes('Event not found', [], 404);

    await prisma.eventCoordinator.deleteMany({ where: { eventId, userId: coordinatorId } });
    if (event.coordinatorId === coordinatorId) {
      const remaining = await prisma.eventCoordinator.findFirst({ where: { eventId }, select: { userId: true } });
      await prisma.hackathonEvent.update({
        where: { id: eventId },
        data: { coordinatorId: remaining?.userId ?? null },
      });
    }
    return successRes({ coordinatorId }, 'Coordinator removed');
  } catch (err) {
    console.error('coordinator DELETE error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
