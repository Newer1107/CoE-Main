import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { committeeCreateEventSchema } from '@/lib/committee-validators';

// GET /api/committee/admin/event
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const activeEvent = await prisma.committeeEvent.findFirst({
      where: { isActive: true },
      orderBy: { id: 'desc' },
      include: {
        tracks: {
          orderBy: { id: 'asc' },
          include: {
            _count: {
              select: { registrations: true },
            },
          },
        },
        rubricItems: {
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!activeEvent) return successRes(null, 'No active committee event.');

    const scoreExists = await prisma.committeeScore.findFirst({
      where: {
        registration: {
          eventId: activeEvent.id,
        },
      },
      select: { id: true },
    });

    return successRes(
      {
        ...activeEvent,
        rubricLocked: Boolean(scoreExists),
      },
      'Committee admin event retrieved successfully.',
    );
  } catch (err) {
    console.error('Committee admin event GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// POST /api/committee/admin/event
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const body = await req.json();
    const parsed = committeeCreateEventSchema.safeParse(body);
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    const title = parsed.data.title.trim();
    const trackNames = Array.from(new Set(parsed.data.tracks.map((name) => name.trim()).filter(Boolean)));
    if (trackNames.length === 0) return errorRes('Validation failed', ['At least one valid track is required.'], 400);

    const created = await prisma.$transaction(async (tx) => {
      await tx.committeeEvent.updateMany({ where: { isActive: true }, data: { isActive: false } });

      const event = await tx.committeeEvent.create({
        data: {
          title,
          isActive: true,
          tracks: {
            create: trackNames.map((name) => ({ name })),
          },
        },
        include: {
          tracks: { orderBy: { id: 'asc' } },
        },
      });

      return event;
    });

    return successRes(created, 'Committee event created successfully.', 201);
  } catch (err) {
    console.error('Committee admin event POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
