import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';

// GET /api/innovation/judge/overview — events the current user is assigned to judge
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);

    const assignments = await prisma.judgeAssignment.findMany({
      where: { judgeId: user.id },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            status: true,
            startTime: true,
            endTime: true,
            submissionLockAt: true,
          },
        },
        venue: { select: { id: true, name: true } },
      },
      orderBy: { id: 'desc' },
    });

    return successRes({ assignments });
  } catch (err) {
    console.error('judge overview error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
