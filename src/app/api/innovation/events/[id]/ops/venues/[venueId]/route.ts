import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent, coordinatorDepartments, normalizeDeptCode } from '@/lib/hackathon-ops';

// PUT  — rename / re-capacity / reorder a venue
// DELETE — remove (blocked while claims are assigned)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; venueId: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const venueId = Number((await params).venueId);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId }, select: { coordinatorId: true, coordinators: { select: { userId: true, departmentCode: true } }, config: true } });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);
    const body = await req.json().catch(() => null);
    const venue = await prisma.venue.findFirst({ where: { id: venueId, eventId } });
    if (!venue) return errorRes('Venue not found', [], 404);
    if (user.role !== 'ADMIN') {
      const allowed = coordinatorDepartments(user.id, event);
      if (allowed !== null && venue.departmentCode !== null && !allowed.includes(venue.departmentCode)) return errorRes('Not allowed for this department', ['You can only edit venues of your department'], 403);
    }

    const name = ((body?.name ?? venue.name) as string).trim().slice(0, 120);
    const capacity = body?.capacity == null || body.capacity === '' ? venue.capacity : Number(body.capacity);
    let nextDept: string | null | undefined = undefined;
    if (body?.departmentCode !== undefined) {
      nextDept = normalizeDeptCode(body.departmentCode);
      if (user.role !== 'ADMIN' && nextDept !== null) {
        const allowed = coordinatorDepartments(user.id, event);
        if (allowed !== null && !allowed.includes(nextDept)) return errorRes('Not allowed for this department', ['You can only set your own department'], 403);
      }
    }
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
      return errorRes('Invalid capacity', ['Capacity must be a positive number'], 400);
    }
    const dup = await prisma.venue.findFirst({ where: { eventId, name, NOT: { id: venueId } } });
    if (dup) return errorRes('Venue already exists', [`A venue named “${name}” already exists`], 409);

    const updated = await prisma.venue.update({
      where: { id: venueId },
      data: { name, capacity, order: body?.order ?? venue.order, ...(nextDept !== undefined ? { departmentCode: nextDept } : {}) },
    });
    return successRes({ venue: updated });
  } catch (err) {
    console.error('venue PUT error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; venueId: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const venueId = Number((await params).venueId);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId }, select: { coordinatorId: true, coordinators: { select: { userId: true, departmentCode: true } } } });
    if (!event) return errorRes('Event not found', [], 404);
    const venue = await prisma.venue.findFirst({ where: { id: venueId, eventId } });
    if (!venue) return errorRes('Venue not found', [], 404);
    if (user.role !== 'ADMIN') {
      const allowed = coordinatorDepartments(user.id, event);
      if (allowed !== null && venue.departmentCode !== null && !allowed.includes(venue.departmentCode)) return errorRes('Not allowed for this department', [], 403);
      if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);
    }

    const assigned = await prisma.claim.count({ where: { venueId } });
    if (assigned > 0) {
      return errorRes('Venue has teams assigned', [`Unassign ${assigned} team${assigned === 1 ? '' : 's'} first`], 409);
    }
    await prisma.venue.delete({ where: { id: venueId } });
    return successRes({ deleted: true });
  } catch (err) {
    console.error('venue DELETE error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
