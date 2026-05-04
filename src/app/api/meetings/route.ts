import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import {
  requireIndustryAccess,
  requireParticipantAccess,
  InternshipWorkspaceError,
} from '@/lib/internship-workspace';
import { createNotifications } from '@/lib/notifications';

const dateTimeInputSchema = z.string().trim().min(1).refine(
  (value) => !Number.isNaN(new Date(value).getTime()),
  { message: 'Invalid datetime' }
);

const createSchema = z.object({
  internshipId: z.number().int().positive(),
  title: z.string().trim().min(2),
  datetime: dateTimeInputSchema,
  link: z.string().url(),
  description: z.string().trim().optional(),
});

const querySchema = z.object({
  internshipId: z.coerce.number().int().positive(),
});

// GET /api/meetings?internshipId
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    await requireParticipantAccess(user, parsed.data.internshipId);

    const meetings = await prisma.internshipMeeting.findMany({
      where: { internshipId: parsed.data.internshipId },
      orderBy: { datetime: 'asc' },
    });

    return successRes(meetings, 'Meetings retrieved successfully.');
  } catch (err) {
    if (err instanceof InternshipWorkspaceError) {
      return errorRes(err.message, err.details, err.status);
    }
    console.error('Meetings GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// POST /api/meetings
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    await requireIndustryAccess(user, parsed.data.internshipId);

    const meeting = await prisma.internshipMeeting.create({
      data: {
        internshipId: parsed.data.internshipId,
        title: parsed.data.title,
        datetime: new Date(parsed.data.datetime),
        link: parsed.data.link,
        description: parsed.data.description?.trim() || null,
      },
    });

    const participants = await prisma.internshipParticipant.findMany({
      where: { internshipId: parsed.data.internshipId },
      select: { studentId: true },
    });

    await createNotifications(
      participants.map((row) => ({
        userId: row.studentId,
        type: 'MEETING_SCHEDULED',
        title: 'New internship meeting scheduled',
        body: meeting.title,
      }))
    );

    return successRes(meeting, 'Meeting created successfully.', 201);
  } catch (err) {
    if (err instanceof InternshipWorkspaceError) {
      return errorRes(err.message, err.details, err.status);
    }
    console.error('Meetings POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
