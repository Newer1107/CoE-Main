import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent, coordinatorDepartments } from '@/lib/hackathon-ops';

// PUT — move judge to another venue (null = all claims)
// DELETE — remove assignment (scores are kept)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; assignmentId: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const assignmentId = Number((await params).assignmentId);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId }, select: { coordinatorId: true, coordinators: { select: { userId: true, departmentCode: true } }, config: true } });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);
    const body = await req.json().catch(() => null);

    const assignment = await prisma.judgeAssignment.findFirst({ where: { id: assignmentId, eventId } });
    if (!assignment) return errorRes('Assignment not found', [], 404);

    const venueId = body?.venueId == null || body?.venueId === '' ? null : Number(body?.venueId);
    if (venueId !== null) {
      const venue = await prisma.venue.findFirst({ where: { id: venueId, eventId } });
      if (!venue) return errorRes('Venue not found', [], 404);
      if (user.role !== 'ADMIN') {
        const allowed = coordinatorDepartments(user.id, event);
        if (allowed !== null) {
          if (venue.departmentCode === null || !allowed.includes(venue.departmentCode)) return errorRes('Not allowed for this department', [], 403);
        }
      }
    } else if (user.role !== 'ADMIN') {
      const allowed = coordinatorDepartments(user.id, event);
      if (allowed !== null) return errorRes('Not allowed', ['Branch coordinators cannot move judges to All dept'], 403);
    }

    const updated = await prisma.judgeAssignment.update({ where: { id: assignmentId }, data: { venueId } });
    return successRes({ assignment: updated });
  } catch (err) {
    console.error('judge PUT error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; assignmentId: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const assignmentId = Number((await params).assignmentId);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId }, select: { coordinatorId: true, coordinators: { select: { userId: true, departmentCode: true } } } });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);
    const assignment = await prisma.judgeAssignment.findFirst({ where: { id: assignmentId, eventId } });
    if (!assignment) return errorRes('Assignment not found', [], 404);
    if (user.role !== 'ADMIN') {
      // dept coordinator can only remove judges in their own dept venues
      if (assignment.venueId === null) return errorRes('Not allowed', ['Branch coordinators cannot remove All dept assignments'], 403);
      const venue = await prisma.venue.findFirst({ where: { id: assignment.venueId, eventId } });
      const allowed = coordinatorDepartments(user.id, event);
      if (allowed !== null && venue && (venue.departmentCode === null || !allowed.includes(venue.departmentCode))) return errorRes('Not allowed for this department', [], 403);
    }

    await prisma.judgeAssignment.delete({ where: { id: assignmentId } });
    return successRes({ deleted: true }, 'Judge unassigned');
  } catch (err) {
    console.error('judge DELETE error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
