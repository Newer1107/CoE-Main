import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent, opsConfig } from '@/lib/hackathon-ops';

// POST /api/innovation/events/[id]/ops/rounds/close-dept — mark a dept's R2 as completed
// { dept: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);
    if (event.status !== 'JUDGING') return errorRes('Complete only while judging', [], 403);

    const body = await req.json().catch(() => ({}));
    const dept = (body.dept ?? '').toString().trim().toUpperCase();
    if (!dept) return errorRes('dept is required', [], 400);

    const cfg = opsConfig(event);
    const r2ByDept = { ...(cfg.r2ByDept ?? {}) };
    if (!r2ByDept[dept] || r2ByDept[dept].status !== 'open') return errorRes(`${dept} R2 is not open`, [], 400);

    r2ByDept[dept] = { ...r2ByDept[dept], status: 'completed' };
    const config = {
      ...((event.config ?? {}) as Record<string, unknown>),
      ops: { ...cfg, r2ByDept },
    };
    await prisma.hackathonEvent.update({ where: { id: eventId }, data: { config } });
    return successRes({ dept, r2ByDept }, `${dept} R2 completed`);
  } catch (err) {
    console.error('rounds close-dept error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
