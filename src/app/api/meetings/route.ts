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

const recurrenceTypeSchema = z.enum(['NONE', 'WEEKLY']);

const createSchema = z.object({
  problemId: z.number().int().positive(),
  title: z.string().trim().min(2),
  datetime: dateTimeInputSchema,
  link: z.string().url(),
  description: z.string().trim().optional(),
  recurrenceType: recurrenceTypeSchema.optional(),
  recurrenceInterval: z.number().int().positive().optional(),
  recurrenceDay: z.number().int().min(0).max(6).optional(),
  isActive: z.boolean().optional(),
});

const querySchema = z.object({
  problemId: z.coerce.number().int().positive(),
});

const OCCURRENCE_LIMIT = 12;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const addWeeks = (value: Date, weeks: number) => new Date(value.getTime() + weeks * WEEK_MS);

const alignToRecurrenceDay = (value: Date, recurrenceDay?: number | null) => {
  if (typeof recurrenceDay !== 'number') return value;
  const currentDay = value.getDay();
  const diff = (recurrenceDay - currentDay + 7) % 7;
  if (diff === 0) return value;
  return new Date(value.getTime() + diff * 24 * 60 * 60 * 1000);
};

type MeetingRow = {
  id: number | string;
  baseId?: number;
  title: string;
  datetime: Date;
  link: string;
  description: string | null;
  recurrenceType: 'NONE' | 'WEEKLY';
  recurrenceInterval: number;
  recurrenceDay: number | null;
  isActive: boolean;
};

const expandRecurringMeeting = (meeting: {
  id: number;
  title: string;
  datetime: Date;
  link: string;
  description: string | null;
  recurrenceType: 'NONE' | 'WEEKLY';
  recurrenceInterval: number;
  recurrenceDay: number | null;
  isActive: boolean;
}): MeetingRow[] => {
  if (meeting.recurrenceType !== 'WEEKLY' || !meeting.isActive) {
    return [meeting];
  }

  const occurrences: MeetingRow[] = [];

  const interval = meeting.recurrenceInterval || 1;
  let occurrence = alignToRecurrenceDay(new Date(meeting.datetime), meeting.recurrenceDay);
  const now = new Date();

  while (occurrence < now) {
    occurrence = addWeeks(occurrence, interval);
  }

  for (let i = 0; i < OCCURRENCE_LIMIT; i += 1) {
    occurrences.push({
      id: `${meeting.id}-${occurrence.toISOString()}`,
      baseId: meeting.id,
      title: meeting.title,
      datetime: occurrence,
      link: meeting.link,
      description: meeting.description,
      recurrenceType: 'WEEKLY',
      recurrenceInterval: interval,
      recurrenceDay: meeting.recurrenceDay,
      isActive: meeting.isActive,
    });
    occurrence = addWeeks(occurrence, interval);
  }

  return occurrences;
};

// GET /api/meetings?problemId
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    await requireParticipantAccess(user, parsed.data.problemId);

    const meetings = await prisma.internshipMeeting.findMany({
      where: { problemId: parsed.data.problemId },
      orderBy: { datetime: 'asc' },
    });

    const expanded: MeetingRow[] = meetings.flatMap((meeting) => expandRecurringMeeting(meeting));
    const sorted = expanded.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

    return successRes(sorted, 'Meetings retrieved successfully.');
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

    await requireIndustryAccess(user, parsed.data.problemId);

    const recurrenceType = parsed.data.recurrenceType ?? 'NONE';
    const recurrenceInterval = recurrenceType === 'WEEKLY'
      ? parsed.data.recurrenceInterval ?? 1
      : 1;
    const recurrenceDay = recurrenceType === 'WEEKLY'
      ? parsed.data.recurrenceDay ?? new Date(parsed.data.datetime).getDay()
      : null;
    const isActive = parsed.data.isActive ?? true;

    const meeting = await prisma.internshipMeeting.create({
      data: {
        problemId: parsed.data.problemId,
        title: parsed.data.title,
        datetime: new Date(parsed.data.datetime),
        link: parsed.data.link,
        description: parsed.data.description?.trim() || null,
        recurrenceType,
        recurrenceInterval,
        recurrenceDay,
        isActive,
      },
    });

    const participants = await prisma.application.findMany({
      where: { problemId: parsed.data.problemId, status: 'SELECTED' },
      select: { userId: true },
    });

    await createNotifications(
      participants.map((row) => ({
        userId: row.userId,
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
