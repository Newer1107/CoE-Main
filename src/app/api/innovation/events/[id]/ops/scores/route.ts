import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent, currentRound } from '@/lib/hackathon-ops';

// GET — scoreboard: claims + per-category scores + totals (ADMIN, venue filter optional)
// PUT — coordinator override { claimId, categoryId, score, reason } (JUDGING only, cap = weight)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId }, select: { coordinatorId: true, coordinators: { select: { userId: true } }, config: true } });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);
    const venueIdParam = req.nextUrl.searchParams.get('venueId');
    const venueId = venueIdParam ? Number(venueIdParam) : null;

    const round = currentRound(event);

    const [categories, claims, problems] = await Promise.all([
      prisma.rubricCategory.findMany({ where: { eventId }, orderBy: { order: 'asc' } }),
      prisma.claim.findMany({
        where: { problem: { eventId }, ...(venueId ? { venueId } : {}) },
        include: {
          venue: { select: { id: true, name: true } },
          problem: { select: { id: true, title: true } },
          rubricScores: { where: { round }, include: { rubricCategory: true } },
          members: { include: { user: { select: { name: true, email: true, uid: true } } } },
        },
        orderBy: { id: 'asc' },
      }),
      prisma.problem.findMany({ where: { eventId }, select: { id: true, title: true }, orderBy: { id: 'asc' } }),
    ]);
    return successRes({ categories, claims, round, problems });
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
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId }, select: { coordinatorId: true, coordinators: { select: { userId: true } }, config: true } });
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

    const statusCheck = await prisma.hackathonEvent.findUnique({ where: { id: eventId }, select: { status: true } });
    if (statusCheck?.status !== 'JUDGING') return errorRes('Scoring is locked', ['Overrides are only allowed while judging is open'], 403);
    if (score > category.weight) {
      return errorRes('Score exceeds category cap', [`Max for “${category.label}” is ${category.weight}`], 400);
    }

    const round = currentRound(event);
    const updated = await prisma.rubricScore.upsert({
      where: { claimId_rubricCategoryId_round: { claimId, rubricCategoryId: categoryId, round } },
      update: { score, comment: `[OVERRIDE] ${reason}` },
      create: { claimId, rubricCategoryId: categoryId, score, round, comment: `[OVERRIDE] ${reason}` },
    });
    return successRes({ score: updated }, 'Score updated');
  } catch (err) {
    console.error('scores PUT error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
