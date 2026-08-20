import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent, opsConfig, deptFromUid } from '@/lib/hackathon-ops';
import { sendInnovationEventClosedScoreEmail } from '@/lib/mailer';

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
    // Notify students in this dept that Round 1 is declared
    const deptClaims = await prisma.claim.findMany({
      where: { problem: { eventId } },
      include: { members: { include: { user: { select: { email: true, uid: true } } } } },
    });
    const deptEmails = deptClaims
      .filter((c: any) => { const lead = c.members.find((m: any) => m.role === 'LEAD'); return lead && (deptFromUid(lead.user.uid) ?? '') === dept; })
      .flatMap((c: any) => c.members.map((m: any) => m.user.email));
    const uniqueEmails = [...new Set(deptEmails)];
    if (uniqueEmails.length > 0) {
      await sendInnovationEventClosedScoreEmail(uniqueEmails, {
        eventTitle: event.title,
        teamName: `${dept} teams`,
        score: null,
        rank: null,
        leaderboardUrl: (process.env.FRONTEND_URL || 'https://tcetcercd.in') + '/hackathons/' + eventId,
      }).catch(() => null);
    }
    return successRes({ dept, round1DeclaredByDept: byDept }, `${dept} Round 1 declared — scores frozen, ${uniqueEmails.length} students notified`);
  } catch (err) {
    console.error('rounds declare error:', err);
    return errorRes('Internal server error', [], 500);
  }
}


// DELETE — undo a dept's R1 declaration (only before R2 opens)
// { dept: string }
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);

    const body = await req.json().catch(() => ({}));
    const dept = (body.dept ?? '').toString().trim().toUpperCase();
    if (!dept) return errorRes('dept is required', [], 400);

    const cfg = opsConfig(event);
    const r2ByDept = cfg.r2ByDept ?? {};
    if (r2ByDept[dept]?.status === 'open') return errorRes('Cannot undo — R2 is already open for this dept', [], 400);

    const byDept = { ...(cfg.round1DeclaredByDept ?? {}) };
    if (!byDept[dept]) return errorRes(`${dept} is not declared`, [], 404);

    delete byDept[dept];
    const config = {
      ...((event.config ?? {}) as Record<string, unknown>),
      ops: { ...cfg, round1DeclaredByDept: byDept },
    };
    await prisma.hackathonEvent.update({ where: { id: eventId }, data: { config } });
    return successRes({ dept, round1DeclaredByDept: byDept }, `${dept} declaration undone`);
  } catch (err) {
    console.error('rounds undo-declare error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
