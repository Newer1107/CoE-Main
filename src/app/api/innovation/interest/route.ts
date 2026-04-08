import { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationInterestCreateSchema, innovationInterestUpdateSchema } from '@/lib/validators';

type InterestRecord = {
  id: number;
  userId: number;
  eventId: number;
  hasDetails: boolean;
  teamName: string | null;
  teamSize: number | null;
  createdAt: Date;
};

const serializeInterest = (interest: InterestRecord) => ({
  id: interest.id,
  userId: interest.userId,
  eventId: interest.eventId,
  hasDetails: interest.hasDetails,
  teamName: interest.teamName,
  teamSize: interest.teamSize,
  createdAt: interest.createdAt.toISOString(),
});

// POST /api/innovation/interest
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const body = await req.json();
    const parsed = innovationInterestCreateSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const event = await prisma.hackathonEvent.findUnique({
      where: { id: parsed.data.eventId },
      select: { id: true },
    });

    if (!event) {
      return errorRes('Hackathon event not found', [], 404);
    }

    let created = false;
    let interest = null as InterestRecord | null;

    try {
      interest = await prisma.hackathonInterest.create({
        data: {
          userId: user.id,
          eventId: parsed.data.eventId,
          hasDetails: false,
        },
      });
      created = true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        interest = await prisma.hackathonInterest.findUnique({
          where: {
            userId_eventId: {
              userId: user.id,
              eventId: parsed.data.eventId,
            },
          },
        });
      } else {
        throw err;
      }
    }

    if (!interest) {
      return errorRes('Could not mark interest', ['Unable to fetch interest record after request.'], 500);
    }

    return successRes(
      {
        interest: serializeInterest(interest),
        created,
      },
      created ? "You're marked as interested." : 'Already marked as interested.',
      created ? 201 : 200
    );
  } catch (err) {
    console.error('Innovation interest POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// PATCH /api/innovation/interest
export async function PATCH(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const body = await req.json();
    const parsed = innovationInterestUpdateSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const existing = await prisma.hackathonInterest.findUnique({
      where: {
        userId_eventId: {
          userId: user.id,
          eventId: parsed.data.eventId,
        },
      },
    });

    if (!existing) {
      return errorRes('Interest not found', ["Mark interest first using I'm Interested before adding team details."], 404);
    }

    const normalizedTeamName = (parsed.data.teamName || '').trim();

    const updated = await prisma.hackathonInterest.update({
      where: { id: existing.id },
      data: {
        teamName: normalizedTeamName.length > 0 ? normalizedTeamName : null,
        teamSize: parsed.data.teamSize,
        hasDetails: true,
      },
    });

    return successRes(
      {
        interest: serializeInterest(updated),
      },
      'Interest details saved successfully.'
    );
  } catch (err) {
    console.error('Innovation interest PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
