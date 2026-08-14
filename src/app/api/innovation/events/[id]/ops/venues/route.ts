import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent } from '@/lib/hackathon-ops';

// GET /api/innovation/events/[id]/ops/venues — venues + counts + unassigned claims
// POST — create venue { name, capacity?, order? }
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    if (!Number.isInteger(eventId)) return errorRes('Invalid event', [], 400);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId }, select: { coordinatorId: true, config: true } });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);

    const [venues, unassignedClaims] = await Promise.all([
      prisma.venue.findMany({
        where: { eventId },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
        include: { _count: { select: { claims: true } } },
      }),
      prisma.claim.findMany({
        where: { problem: { eventId }, venueId: null },
        select: { id: true, teamName: true, status: true },
        orderBy: { id: 'asc' },
      }),
    ]);
    return successRes({ venues, unassignedClaims });
  } catch (err) {
    console.error('venues GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId }, select: { coordinatorId: true, config: true } });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);
    const body = await req.json().catch(() => null);
    const name = ((body?.name ?? '') as string).trim().slice(0, 120);
    if (!name) return errorRes('Venue name is required', [], 400);
    const capacity = body?.capacity == null || body.capacity === '' ? null : Number(body.capacity);
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
      return errorRes('Invalid capacity', ['Capacity must be a positive number'], 400);
    }

    const existing = await prisma.venue.findFirst({ where: { eventId, name } });
    if (existing) return errorRes('Venue already exists', [`A venue named “${name}” already exists`], 409);

    const venue = await prisma.venue.create({
      data: { eventId, name, capacity, order: body?.order ?? 0 },
    });
    return successRes({ venue }, 'Venue created', 201);
  } catch (err) {
    console.error('venues POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
