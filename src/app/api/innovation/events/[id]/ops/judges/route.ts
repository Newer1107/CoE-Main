import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent, coordinatorDepartments } from '@/lib/hackathon-ops';

// GET — assignments for the event (judge info + venue + claim count)
// POST — upsert { judgeId, venueId? } (venueId null = all claims)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId }, select: { coordinatorId: true, coordinators: { select: { userId: true, departmentCode: true } }, config: true } });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);
    const allowedDepts = user.role === 'ADMIN' ? null : coordinatorDepartments(user.id, event);

    const [assignments, allVenues, faculty] = await Promise.all([
      prisma.judgeAssignment.findMany({
        where: { eventId },
        include: {
          judge: { select: { id: true, name: true, email: true, role: true } },
          venue: { select: { id: true, name: true } },
        },
        orderBy: { id: 'asc' },
      }),
      prisma.venue.findMany({ where: { eventId }, select: { id: true, name: true, departmentCode: true } }),
      prisma.user.findMany({
        where: { role: { in: ['FACULTY', 'ADMIN'] }, status: 'ACTIVE' },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    const venues = allowedDepts === null ? allVenues : allVenues.filter((v: { departmentCode: string | null }) => v.departmentCode !== null && allowedDepts.includes(v.departmentCode));
    const assignmentsOut = allowedDepts === null
      ? assignments
      : assignments.filter((a: { venueId: number | null }) => {
          if (a.venueId === null) return false;
          const v = (allVenues as { id: number; departmentCode: string | null }[]).find((x) => x.id === a.venueId);
          if (!v) return false;
          return v.departmentCode !== null && allowedDepts.includes(v.departmentCode);
        });
    return successRes({ assignments: assignmentsOut, venues, faculty });
  } catch (err) {
    console.error('judges GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId }, select: { coordinatorId: true, coordinators: { select: { userId: true, departmentCode: true } }, config: true } });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);
    const body = await req.json().catch(() => null);
    const judgeId = Number(body?.judgeId);
    const venueId = body?.venueId == null || body?.venueId === '' ? null : Number(body?.venueId);
    if (!Number.isInteger(judgeId)) return errorRes('Select a judge', [], 400);

    const judge = await prisma.user.findFirst({ where: { id: judgeId, status: 'ACTIVE' } });
    if (!judge) return errorRes('Judge not found', [], 404);
    if (venueId !== null) {
      const venue = await prisma.venue.findFirst({ where: { id: venueId, eventId } });
      if (!venue) return errorRes('Venue not found', [], 404);
      if (user.role !== 'ADMIN') {
        const allowed = coordinatorDepartments(user.id, event);
        if (allowed !== null) {
          if (venue.departmentCode === null || !allowed.includes(venue.departmentCode)) return errorRes('Not allowed for this department', ['You can only assign judges to your department venues'], 403);
        }
      }
    } else if (user.role !== 'ADMIN') {
      const allowed = coordinatorDepartments(user.id, event);
      if (allowed !== null) return errorRes('Not allowed', ['Branch coordinators cannot assign judges to All dept venues — pick a venue in your department'], 403);
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
