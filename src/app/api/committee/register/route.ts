import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { committeeRegisterSchema } from '@/lib/committee-validators';
import { getActiveCommitteeEvent } from '@/lib/committee';

// POST /api/committee/register
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const activeEvent = await getActiveCommitteeEvent();
    if (!activeEvent) return errorRes('No active committee event', [], 404);

    const body = await req.json();
    const parsed = committeeRegisterSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const track = await prisma.committeeTrack.findFirst({
      where: { id: parsed.data.trackId, eventId: activeEvent.id },
      select: { id: true, name: true, room: true },
    });

    if (!track) return errorRes('Committee track not found for active event', [], 404);

    await prisma.committeeRegistration.create({
      data: {
        eventId: activeEvent.id,
        trackId: track.id,
        userId: user.id,
      },
    });

    return successRes(
      {
        eventId: activeEvent.id,
        eventTitle: activeEvent.title,
        track: {
          id: track.id,
          name: track.name,
          room: track.room,
        },
      },
      'Committee registration created successfully.',
      201,
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return errorRes('You are already registered.', [], 409);
    }

    console.error('Committee register POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
