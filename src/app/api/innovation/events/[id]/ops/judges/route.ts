import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';

// GET — assignments for the event (judge info + venue + claim count)
// POST — upsert { judgeId, venueId? } (venueId null = all claims)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user || user.role !== 'ADMIN') return errorRes('Admins only', [], 403);
    const eventId = Number((await params).id);

    const [assignments, allVenues, faculty] = await Promise.all([
      prisma.judgeAssignment.findMany({
        where: { eventId },
        include: {
          judge: { select: { id: true, name: true, email: true, role: true } },
          venue: { select: { id: true, name: true } },
        },
        orderBy: { id: 'asc' },
      }),
      prisma.venue.findMany({ where: { eventId }, select: { id: true, name: true } }),
      prisma.user.findMany({
        where: { role: { in: ['FACULTY', 'ADMIN'] }, status: 'ACTIVE' },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return successRes({ assignments, venues: allVenues, faculty });
  } catch (err) {
    console.error('judges GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user || user.role !== 'ADMIN') return errorRes('Admins only', [], 403);
    const eventId = Number((await params).id);
    const body = await req.json().catch(() => null);
    const judgeId = Number(body?.judgeId);
    const venueId = body?.venueId == null || body?.venueId === '' ? null : Number(body?.venueId);
    if (!Number.isInteger(judgeId)) return errorRes('Select a judge', [], 400);

    const judge = await prisma.user.findFirst({ where: { id: judgeId, status: 'ACTIVE' } });
    if (!judge) return errorRes('Judge not found', [], 404);
    if (venueId !== null) {
      const venue = await prisma.venue.findFirst({ where: { id: venueId, eventId } });
      if (!venue) return errorRes('Venue not found', [], 404);
    }

    const assignment = await prisma.judgeAssignment.upsert({
      where: { eventId_judgeId: { eventId, judgeId } },
      update: { venueId },
      create: { eventId, judgeId, venueId },
    });
    return successRes({ assignment }, 'Judge assigned');
  } catch (err) {
    console.error('judges POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
