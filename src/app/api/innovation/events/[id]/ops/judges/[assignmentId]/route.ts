import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';

// PUT — move judge to another venue (null = all claims)
// DELETE — remove assignment (scores are kept)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; assignmentId: string }> }) {
  try {
    const user = authenticate(req);
    if (!user || user.role !== 'ADMIN') return errorRes('Admins only', [], 403);
    const eventId = Number((await params).id);
    const assignmentId = Number((await params).assignmentId);
    const body = await req.json().catch(() => null);

    const assignment = await prisma.judgeAssignment.findFirst({ where: { id: assignmentId, eventId } });
    if (!assignment) return errorRes('Assignment not found', [], 404);

    const venueId = body?.venueId == null || body?.venueId === '' ? null : Number(body?.venueId);
    if (venueId !== null) {
      const venue = await prisma.venue.findFirst({ where: { id: venueId, eventId } });
      if (!venue) return errorRes('Venue not found', [], 404);
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
    if (!user || user.role !== 'ADMIN') return errorRes('Admins only', [], 403);
    const eventId = Number((await params).id);
    const assignmentId = Number((await params).assignmentId);

    const assignment = await prisma.judgeAssignment.findFirst({ where: { id: assignmentId, eventId } });
    if (!assignment) return errorRes('Assignment not found', [], 404);

    await prisma.judgeAssignment.delete({ where: { id: assignmentId } });
    return successRes({ deleted: true }, 'Judge unassigned');
  } catch (err) {
    console.error('judge DELETE error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
