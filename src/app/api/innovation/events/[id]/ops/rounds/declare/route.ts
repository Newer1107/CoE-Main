import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent, opsConfig } from '@/lib/hackathon-ops';

// POST /api/innovation/events/[id]/ops/rounds/declare — coordinator declares Phase 1 for a specific dept
// { dept: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);
    if (event.status !== 'JUDGING') return errorRes('Declare only while judging', [], 403);

    const body = await req.json().catch(() => ({}));
    const dept = (body.dept ?? '').toString().trim().toUpperCase();
    if (!dept) return errorRes('dept is required', ['e.g. COMP, CSE, ENTC'], 400);

    const cfg = opsConfig(event);
    const byDept = { ...(cfg.round1DeclaredByDept ?? {}) };
    if (byDept[dept]) return errorRes(`${dept} already declared`, [], 409);

    // Validate: at least one team scored in this dept
    const { deptFromUid } = await import('@/lib/hackathon-ops');
    const scoredCount = await prisma.claim.count({ where: { problem: { eventId }, rubricScores: { some: {} } } });
    if (scoredCount === 0) return errorRes('No scored teams', ['Score at least one team before declaring'], 400);

    byDept[dept] = true;
    const config = {
      ...((event.config ?? {}) as Record<string, unknown>),
      ops: { ...cfg, round1DeclaredByDept: byDept },
    };
    await prisma.hackathonEvent.update({ where: { id: eventId }, data: { config } });
    return successRes({ dept, round1DeclaredByDept: byDept }, `${dept} Round 1 declared — scores frozen`);
  } catch (err) {
    console.error('rounds declare error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
