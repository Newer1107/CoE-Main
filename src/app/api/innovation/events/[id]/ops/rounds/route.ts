import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent } from '@/lib/hackathon-ops';
import { opsConfig } from '@/lib/hackathon-ops';

// GET  — current judging round for the event
// POST — advance to the next round (ADMIN, JUDGING only, capped at judgeRounds)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const eventId = Number((await params).id);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
    if (!event) return errorRes('Event not found', [], 404);
    const cfg = opsConfig(event);
    const round = cfg.currentRound ?? 1;
    const maxRound = Math.max(1, cfg.judgeRounds ?? 1);
    const round1DeclaredByDept = cfg.round1DeclaredByDept ?? {};
    const r2ByDept = cfg.r2ByDept ?? {};
    return successRes({ round, maxRound, round1DeclaredByDept, r2ByDept });
  } catch (err) {
    console.error('rounds GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);
    if (event.status !== 'JUDGING') return errorRes('Rounds only advance during judging', [], 403);

    const cfg = opsConfig(event);
    const maxRound = Math.max(1, cfg.judgeRounds ?? 1);
    const current = cfg.currentRound ?? 1;
    if (current >= maxRound) return errorRes('Already at the final round', [], 409);

    const config = { ...((event.config ?? {}) as Record<string, unknown>), ops: { ...cfg, currentRound: current + 1 } };
    await prisma.hackathonEvent.update({ where: { id: eventId }, data: { config } });
    return successRes({ round: current + 1, maxRound }, `Round ${current + 1} opened`);
  } catch (err) {
    console.error('rounds POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
