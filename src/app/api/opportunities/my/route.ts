import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';

// GET /api/opportunities/my — student's saved/interested opportunities
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const interests = await prisma.opportunityInterest.findMany({
      where: {
        userId: user.id,
        status: { in: ['SAVED', 'INTERESTED'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        opportunity: {
          select: {
            id: true,
            title: true,
            category: true,
            registrationDeadline: true,
            applicationUrl: true,
            status: true,
          },
        },
      },
    });

    return successRes(interests, 'My opportunities retrieved successfully.');
  } catch (err) {
    console.error('My opportunities GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
