import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent, coordinatorDepartments } from '@/lib/hackathon-ops';

// DELETE /api/innovation/events/[id]/ops/judges/by-judge/[judgeId]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; judgeId: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const judgeId = Number((await params).judgeId);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId }, select: { coordinatorId: true, coordinators: { select: { userId: true, departmentCode: true } } } });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);

    // dept coordinator can only remove judges in their own dept venues
    if (user.role !== 'ADMIN') {
      const assignment = await prisma.judgeAssignment.findFirst({ where: { eventId, judgeId } });
      if (assignment?.venueId === null) return errorRes('Not allowed', ['Branch coordinators cannot remove All dept assignments'], 403);
      if (assignment?.venueId) {
        const venue = await prisma.venue.findFirst({ where: { id: assignment.venueId, eventId } });
        const allowed = coordinatorDepartments(user.id, event);
        if (allowed !== null && venue && (venue.departmentCode === null || !allowed.includes(venue.departmentCode))) return errorRes('Not allowed for this department', [], 403);
      }
    }

    await prisma.judgeAssignment.deleteMany({ where: { eventId, judgeId } });
    return successRes({ deleted: true }, 'Judge unassigned');
  } catch (err) {
    console.error('judge DELETE byJudge error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
