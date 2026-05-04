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
  description: z.string().trim().optional(),
  assignedToId: z.number().int().positive(),
  deadline: dateTimeInputSchema.optional(),
});

const querySchema = z.object({
  internshipId: z.coerce.number().int().positive(),
});

const updateSchema = z.object({
  taskId: z.number().int().positive(),
  title: z.string().trim().min(2).optional(),
  description: z.string().trim().optional().nullable(),
  assignedToId: z.number().int().positive().optional(),
  deadline: dateTimeInputSchema.optional().nullable(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']).optional(),
});

// GET /api/tasks?internshipId
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    await requireParticipantAccess(user, parsed.data.internshipId);

    const tasks = await prisma.internshipTask.findMany({
      where: {
        internshipId: parsed.data.internshipId,
        ...(user.role === 'STUDENT' ? { assignedToId: user.id } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });

    return successRes(tasks, 'Tasks retrieved successfully.');
  } catch (err) {
    if (err instanceof InternshipWorkspaceError) {
      return errorRes(err.message, err.details, err.status);
    }
    console.error('Tasks GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// POST /api/tasks
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

    const participant = await prisma.internshipParticipant.findFirst({
      where: { internshipId: parsed.data.internshipId, studentId: parsed.data.assignedToId },
    });
    if (!participant) {
      return errorRes('Invalid assignee', ['Assignee must be a participant in this internship.'], 400);
    }

    const task = await prisma.internshipTask.create({
      data: {
        internshipId: parsed.data.internshipId,
        title: parsed.data.title,
        description: parsed.data.description?.trim() || null,
        assignedToId: parsed.data.assignedToId,
        deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
      },
      include: { assignedTo: { select: { id: true, name: true, email: true } } },
    });

    await createNotifications([
      {
        userId: parsed.data.assignedToId,
        type: 'TASK_ASSIGNED',
        title: 'New internship task assigned',
        body: `${task.title}`,
      },
    ]);

    return successRes(task, 'Task created successfully.', 201);
  } catch (err) {
    if (err instanceof InternshipWorkspaceError) {
      return errorRes(err.message, err.details, err.status);
    }
    console.error('Tasks POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// PATCH /api/tasks
export async function PATCH(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    const task = await prisma.internshipTask.findUnique({
      where: { id: parsed.data.taskId },
      include: { internship: { select: { id: true, industryPartnerId: true } } },
    });

    if (!task) return errorRes('Task not found', [], 404);

    if (user.role === 'STUDENT') {
      if (task.assignedToId !== user.id) {
        return errorRes('Forbidden', ['You can only update your own tasks.'], 403);
      }

      if (!parsed.data.status) {
        return errorRes('Validation failed', ['Status update is required.'], 400);
      }

      const updated = await prisma.internshipTask.update({
        where: { id: task.id },
        data: { status: parsed.data.status },
        include: { assignedTo: { select: { id: true, name: true, email: true } } },
      });

      return successRes(updated, 'Task updated successfully.');
    }

    if (user.role !== 'ADMIN' && task.internship.industryPartnerId !== user.id) {
      return errorRes('Forbidden', ['Industry partner access required'], 403);
    }

    if (parsed.data.assignedToId) {
      const participant = await prisma.internshipParticipant.findFirst({
        where: { internshipId: task.internship.id, studentId: parsed.data.assignedToId },
      });
      if (!participant) {
        return errorRes('Invalid assignee', ['Assignee must be a participant in this internship.'], 400);
      }
    }

    const updated = await prisma.internshipTask.update({
      where: { id: task.id },
      data: {
        title: parsed.data.title ?? undefined,
        description: parsed.data.description ?? undefined,
        assignedToId: parsed.data.assignedToId ?? undefined,
        deadline: parsed.data.deadline === undefined ? undefined : parsed.data.deadline ? new Date(parsed.data.deadline) : null,
        status: parsed.data.status ?? undefined,
      },
      include: { assignedTo: { select: { id: true, name: true, email: true } } },
    });

    if (parsed.data.assignedToId) {
      await createNotifications([
        {
          userId: parsed.data.assignedToId,
          type: 'TASK_ASSIGNED',
          title: 'Internship task reassigned',
          body: `${updated.title}`,
        },
      ]);
    }

    return successRes(updated, 'Task updated successfully.');
  } catch (err) {
    if (err instanceof InternshipWorkspaceError) {
      return errorRes(err.message, err.details, err.status);
    }
    console.error('Tasks PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
