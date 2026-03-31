import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';

// GET /api/innovation/applications/my
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const applications = await prisma.application.findMany({
      where: { userId: user.id },
      include: {
        problem: { select: { id: true, title: true } },
        profile: { select: { skills: true, experience: true, interests: true } },
        answers: {
          include: { question: { select: { id: true, questionText: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return successRes(applications, 'Applications retrieved successfully.');
  } catch (err) {
    console.error('Applications my GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
