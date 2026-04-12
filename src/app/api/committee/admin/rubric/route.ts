import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { committeeCreateRubricSchema } from '@/lib/committee-validators';

const hasCommitteeScores = async (eventId: number) => {
  const scoreCount = await prisma.committeeScore.count({
    where: {
      registration: {
        eventId,
      },
    },
  });

  return scoreCount > 0;
};

// POST /api/committee/admin/rubric
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const body = await req.json();
    const parsed = committeeCreateRubricSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const event = await prisma.committeeEvent.findUnique({ where: { id: parsed.data.eventId }, select: { id: true } });
    if (!event) return errorRes('Committee event not found', [], 404);

    if (await hasCommitteeScores(parsed.data.eventId)) {
      return errorRes('Scoring has already begun, rubric cannot be changed.', [], 409);
    }

    await prisma.committeeRubricItem.createMany({
      data: parsed.data.items.map((item) => ({
        eventId: parsed.data.eventId,
        label: item.label.trim(),
        maxScore: item.maxScore,
        weight: item.weight,
        order: item.order,
      })),
    });

    const rubric = await prisma.committeeRubricItem.findMany({
      where: { eventId: parsed.data.eventId },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });

    return successRes(rubric, 'Committee rubric items created successfully.', 201);
  } catch (err) {
    console.error('Committee rubric POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// PUT /api/committee/admin/rubric
export async function PUT(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const body = await req.json();
    const parsed = committeeCreateRubricSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const event = await prisma.committeeEvent.findUnique({ where: { id: parsed.data.eventId }, select: { id: true } });
    if (!event) return errorRes('Committee event not found', [], 404);

    if (await hasCommitteeScores(parsed.data.eventId)) {
      return errorRes('Scoring has already begun, rubric cannot be changed.', [], 409);
    }

    const rubric = await prisma.$transaction(async (tx) => {
      await tx.committeeRubricItem.deleteMany({ where: { eventId: parsed.data.eventId } });
      await tx.committeeRubricItem.createMany({
        data: parsed.data.items.map((item) => ({
          eventId: parsed.data.eventId,
          label: item.label.trim(),
          maxScore: item.maxScore,
          weight: item.weight,
          order: item.order,
        })),
      });

      return tx.committeeRubricItem.findMany({
        where: { eventId: parsed.data.eventId },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      });
    });

    return successRes(rubric, 'Committee rubric replaced successfully.');
  } catch (err) {
    console.error('Committee rubric PUT error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
