import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';

// GET /api/innovation/admin/submissions
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { searchParams } = new URL(req.url);
    const eventIdRaw = searchParams.get('eventId');
    const problemIdRaw = searchParams.get('problemId');

    const where: Record<string, unknown> = {
      status: 'SUBMITTED',
    };

    if (problemIdRaw) {
      const problemId = Number(problemIdRaw);
      if (!Number.isInteger(problemId) || problemId <= 0) return errorRes('Invalid problemId filter', [], 400);
      where.problemId = problemId;
    }

    if (eventIdRaw) {
      const eventId = Number(eventIdRaw);
      if (!Number.isInteger(eventId) || eventId <= 0) return errorRes('Invalid eventId filter', [], 400);
      where.problem = { eventId };
    }

    const submissions = await prisma.claim.findMany({
      where,
      include: {
        problem: {
          include: {
            event: { select: { id: true, title: true, status: true } },
            createdBy: { select: { id: true, name: true, email: true } },
          },
        },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: [{ updatedAt: 'asc' }],
    });

    return successRes(submissions, 'Submitted claims retrieved.');
  } catch (err) {
    console.error('Innovation admin submissions GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
