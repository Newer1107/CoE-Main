import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent, opsConfig, coordinatorDepartments, deptFromUid } from '@/lib/hackathon-ops';

// POST /api/innovation/events/[id]/ops/rounds/advance — batch advance selected teams to Round 2
// { claimIds: number[], round2VenueId?: number }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);

    const cfg = opsConfig(event);
    const body = await req.json().catch(() => ({}));
    const advDept = (body?.dept ?? '').toString().trim().toUpperCase();
    if (!advDept) return errorRes('dept is required', [], 400);
    const byDeptR1 = cfg.round1DeclaredByDept ?? {};
    if (!byDeptR1[advDept]) return errorRes(`${advDept} Round 1 not declared yet`, [], 400);
    const allowedDepts = user.role === 'ADMIN' ? null : coordinatorDepartments(user.id, event);
    // Dept coordinator can only advance their own dept
    if (allowedDepts !== null && !allowedDepts.includes(advDept)) return errorRes('Not allowed for this department', [], 403);

    const claimIds: number[] = Array.isArray(body?.claimIds) ? body.claimIds.map(Number).filter(Number.isInteger) : [];
    const round2VenueId = body?.round2VenueId == null || body.round2VenueId === '' ? null : Number(body.round2VenueId);
    if (claimIds.length === 0) return errorRes('Select teams to advance', [], 400);

    // Validate venue if provided
    if (round2VenueId) {
      const venue = await prisma.venue.findFirst({ where: { id: round2VenueId, eventId } });
      if (!venue) return errorRes('Venue not found', [], 404);
    }

    // Fetch claims — allow SUBMITTED or already SHORTLISTED (idempotent)
    const claims = await prisma.claim.findMany({
      where: { id: { in: claimIds }, problem: { eventId }, status: { in: ['SUBMITTED', 'SHORTLISTED'] as any } },
      select: { id: true, status: true, members: { include: { user: { select: { uid: true } } } } },
    });
    if (claims.length !== claimIds.length) return errorRes('Some claims not found or not eligible', [], 400);

    // Dept scoping: coordinator can only advance their own dept teams
    if (allowedDepts !== null) {
      for (const c of claims) {
        const lead = c.members.find((m: { role: string }) => m.role === 'LEAD');
        const dept = deptFromUid((lead as { user: { uid: string | null } })?.user.uid ?? '');
        if (!allowedDepts.includes(dept ?? '')) return errorRes('Not allowed for this department', ['You can only advance teams from your department'], 403);
      }
    }

    // Only update teams not yet SHORTLISTED (idempotent)
    const notYetAdvanced = claims.filter((c) => c.status !== 'SHORTLISTED');
    if (notYetAdvanced.length === 0) return successRes({ advanced: 0, round2VenueId }, 'Teams already advanced');

    await prisma.claim.updateMany({
      where: { id: { in: notYetAdvanced.map((c) => c.id) }, problem: { eventId } },
      data: { status: 'SHORTLISTED' as any, round2VenueId },
    });

    return successRes({ advanced: notYetAdvanced.length, round2VenueId }, `${notYetAdvanced.length} team(s) advanced to Round 2`);
  } catch (err) {
    console.error('rounds advance error:', err);
    return errorRes('Internal server error', [], 500);
  }
}


// PUT — update a single team's Phase 2 venue
// { claimId: number, round2VenueId: number | null }
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);

    const body = await req.json().catch(() => ({}));
    const claimId = Number(body?.claimId);
    const round2VenueId = body?.round2VenueId == null || body.round2VenueId === '' ? null : Number(body.round2VenueId);
    if (!Number.isInteger(claimId)) return errorRes('claimId is required', [], 400);

    if (round2VenueId) {
      const venue = await prisma.venue.findFirst({ where: { id: round2VenueId, eventId } });
      if (!venue) return errorRes('Venue not found', [], 404);
    }

    const claim = await prisma.claim.findFirst({ where: { id: claimId, problem: { eventId } } });
    if (!claim) return errorRes('Claim not found', [], 404);
    if (claim.status !== 'SHORTLISTED' as any) return errorRes('Team not advanced to Round 2', [], 400);

    await prisma.claim.update({ where: { id: claimId }, data: { round2VenueId } });
    return successRes({ claimId, round2VenueId }, 'Phase 2 venue updated');
  } catch (err) {
    console.error('rounds advance PUT error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
