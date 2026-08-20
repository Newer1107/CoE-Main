import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent, coordinatorDepartments, currentRound, deptFromUid } from '@/lib/hackathon-ops';
import { ensureSihBinaryRubrics } from '@/lib/sih-binary-rubrics';

// GET — scoreboard: claims + per-category scores + totals (ADMIN, venue filter optional)
// PUT — coordinator override { claimId, categoryId, score, reason } (JUDGING only, cap = weight)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId }, select: { coordinatorId: true, coordinators: { select: { userId: true, departmentCode: true } }, config: true } });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);
    const allowedDeptsScores = user.role === 'ADMIN' ? null : coordinatorDepartments(user.id, event);
    const venueIdParam = req.nextUrl.searchParams.get('venueId');
    const venueId = venueIdParam ? Number(venueIdParam) : null;

    const round = currentRound(event);
    // auto-seed binary rubrics on live SIH events still on legacy weights (prod event 3, dev event 7 already seeded)
    await ensureSihBinaryRubrics(prisma, eventId);

    const [categories, claims, problems] = await Promise.all([
      prisma.rubricCategory.findMany({ where: { eventId }, orderBy: [{ parentCategoryId: 'asc' }, { order: 'asc' }] }),
      prisma.claim.findMany({
        where: { problem: { eventId }, ...(venueId ? { venueId } : {}) },
        select: {
          id: true,
          teamName: true,
          status: true,
          presentationScheduledAt: true,
          submissionFileKey: true,
          round2VenueId: true,
          venue: { select: { id: true, name: true } },
          problem: { select: { id: true, title: true } },
          rubricScores: { include: { rubricCategory: true, judge: { select: { id: true, name: true } } }, orderBy: { round: 'asc' } },
          members: { include: { user: { select: { name: true, email: true, uid: true } } } },
        },
        orderBy: { id: 'asc' },
      }),
      prisma.problem.findMany({ where: { eventId }, select: { id: true, title: true }, orderBy: { id: 'asc' } }),
    ]);
    const filteredClaims = allowedDeptsScores === null ? claims : claims.filter((c: { members: { role: string; user: { uid: string | null } }[] }) => { const lead = c.members.find((m) => m.role === 'LEAD'); return lead && allowedDeptsScores.includes(deptFromUid(lead.user.uid) ?? ''); });
    const cfg = (event.config as { registration?: Record<string, unknown> } | null)?.registration ?? {};
    const allowOpenInnovation = cfg.allowOpenInnovation === true;
    // Pick latest round's scores per claim (so round 1 shows when round 2 has no scores yet)
    const enrichedClaims = filteredClaims.map((c) => {
      if (c.rubricScores.length === 0) return c;
      const lastRound = Math.max(...c.rubricScores.map((s) => s.round));
      return { ...c, rubricScores: c.rubricScores.filter((s) => s.round === lastRound) };
    });
    return successRes({ categories, claims: enrichedClaims, round, problems, allowOpenInnovation });
  } catch (err) {
    console.error('scores GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId }, select: { coordinatorId: true, coordinators: { select: { userId: true, departmentCode: true } }, config: true } });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);
    const body = await req.json().catch(() => null);
    const claimId = Number(body?.claimId);
    const categoryId = Number(body?.categoryId);
    const score = Number(body?.score);
    const reason = ((body?.reason ?? '') as string).trim().slice(0, 200);
    if (!Number.isInteger(claimId) || !Number.isInteger(categoryId)) return errorRes('Invalid claim or category', [], 400);
    if (!Number.isInteger(score) || score < 0) return errorRes('Invalid score', [], 400);
    if (!reason) return errorRes('Reason is required', ['Add a short reason for the override'], 400);

    const [category, claim] = await Promise.all([
      prisma.rubricCategory.findFirst({ where: { id: categoryId, eventId } }),
      prisma.claim.findFirst({ where: { id: claimId, problem: { eventId } } }),
    ]);
    if (!category || !claim) return errorRes('Claim or category not found', [], 404);
    if (user.role !== 'ADMIN') {
      const allowedDeptsPut = coordinatorDepartments(user.id, event);
      if (allowedDeptsPut !== null) {
        const leadUid = await prisma.claimMember.findFirst({ where: { claimId, role: 'LEAD' }, select: { user: { select: { uid: true } } } }).then((r) => (r as unknown as { user: { uid: string | null } } | null)?.user.uid ?? null);
        if (!leadUid || !allowedDeptsPut.includes(deptFromUid(leadUid) ?? '')) return errorRes('Not allowed for this department', ['You can only score teams from your department'], 403);
      }
    }

    const statusCheck = await prisma.hackathonEvent.findUnique({ where: { id: eventId }, select: { status: true } });
    if (statusCheck?.status !== 'JUDGING') return errorRes('Scoring is locked', ['Overrides are only allowed while judging is open'], 403);
    if (score > category.weight) {
      return errorRes('Score exceeds category cap', [`Max for “${category.label}” is ${category.weight}`], 400);
    }

    const round = currentRound(event);
    // Coordinator override: record against the coordinator's own judgeId so per-judge averaging keeps it.
    const overrideJudgeId = user.id;
    const updated = await prisma.rubricScore.upsert({
      where: { claimId_rubricCategoryId_round_judgeId: { claimId, rubricCategoryId: categoryId, round, judgeId: overrideJudgeId } },
      update: { score, comment: `[OVERRIDE] ${reason}` },
      create: { claimId, rubricCategoryId: categoryId, score, round, judgeId: overrideJudgeId, comment: `[OVERRIDE] ${reason}` },
    });
    return successRes({ score: updated }, 'Score updated');
  } catch (err) {
    console.error('scores PUT error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
