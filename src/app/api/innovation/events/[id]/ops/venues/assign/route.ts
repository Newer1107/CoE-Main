import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent } from '@/lib/hackathon-ops';

// POST  /ops/venues/assign  { claimIds: number[], venueId: number } — bulk assign w/ capacity check
// DELETE /ops/venues/assign  { claimIds: number[] } — unassign
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId }, select: { coordinatorId: true, config: true } });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);
    const body = await req.json().catch(() => null);
    const claimIds: number[] = Array.isArray(body?.claimIds) ? body.claimIds.map(Number).filter(Number.isInteger) : [];
    const venueId = Number(body?.venueId);
    if (claimIds.length === 0 || !Number.isInteger(venueId)) return errorRes('Select teams and a venue', [], 400);

    const venue = await prisma.venue.findFirst({ where: { id: venueId, eventId } });
    if (!venue) return errorRes('Venue not found', [], 404);

    const claims = await prisma.claim.findMany({ where: { id: { in: claimIds }, problem: { eventId } } });
    if (claims.length !== claimIds.length) return errorRes('Some teams are not part of this event', [], 400);

    const currentlyAssigned = await prisma.claim.count({ where: { venueId } });
    if (venue.capacity !== null && currentlyAssigned + claimIds.length > venue.capacity) {
      return errorRes('Venue is full', [`“${venue.name}” holds ${venue.capacity}; ${currentlyAssigned} already assigned`], 409);
    }

    await prisma.$transaction(
      claimIds.map((id) => prisma.claim.update({ where: { id }, data: { venueId } })),
    );
    return successRes({ assigned: claimIds.length });
  } catch (err) {
    console.error('venue assign error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user || user.role !== 'ADMIN') return errorRes('Admins only', [], 403);
    const eventId = Number((await params).id);
    const body = await req.json().catch(() => null);
    const claimIds: number[] = Array.isArray(body?.claimIds) ? body.claimIds.map(Number).filter(Number.isInteger) : [];
    if (claimIds.length === 0) return errorRes('Select teams to unassign', [], 400);

    const claims = await prisma.claim.findMany({ where: { id: { in: claimIds }, problem: { eventId } } });
    if (claims.length !== claimIds.length) return errorRes('Some teams are not part of this event', [], 400);

    await prisma.$transaction(
      claimIds.map((id) => prisma.claim.update({ where: { id }, data: { venueId: null } })),
    );
    return successRes({ unassigned: claimIds.length });
  } catch (err) {
    console.error('venue unassign error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
