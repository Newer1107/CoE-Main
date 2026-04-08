import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';

// GET /api/innovation/admin/interests?eventId=123
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const eventIdParam = req.nextUrl.searchParams.get('eventId');
    const eventId = eventIdParam ? Number(eventIdParam) : null;

    if (eventIdParam && (!Number.isInteger(eventId) || (eventId as number) <= 0)) {
      return errorRes('Invalid event id', [], 400);
    }

    const events = await prisma.hackathonEvent.findMany({
      where: eventId ? { id: eventId } : undefined,
      orderBy: [{ startTime: 'asc' }],
      select: {
        id: true,
        title: true,
        status: true,
        interests: {
          orderBy: [{ createdAt: 'desc' }],
          select: {
            id: true,
            userId: true,
            hasDetails: true,
            teamName: true,
            teamSize: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                uid: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    if (eventId && events.length === 0) {
      return errorRes('Hackathon event not found', [], 404);
    }

    const payload = events.map((event) => {
      const totalInterested = event.interests.length;
      const totalWithDetails = event.interests.filter((interest) => interest.hasDetails).length;

      return {
        eventId: event.id,
        eventTitle: event.title,
        eventStatus: event.status,
        totalInterested,
        totalWithDetails,
        interestedStudents: event.interests.map((interest) => ({
          id: interest.id,
          userId: interest.userId,
          hasDetails: interest.hasDetails,
          teamName: interest.teamName,
          teamSize: interest.teamSize,
          createdAt: interest.createdAt.toISOString(),
          user: {
            id: interest.user.id,
            name: interest.user.name,
            email: interest.user.email,
            uid: interest.user.uid,
            phone: interest.user.phone,
          },
        })),
      };
    });

    return successRes(payload, 'Hackathon interest details retrieved.');
  } catch (err) {
    console.error('Innovation admin interests GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
