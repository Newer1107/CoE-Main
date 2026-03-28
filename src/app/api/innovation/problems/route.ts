import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationProblemCreateSchema } from '@/lib/validators';

// GET /api/innovation/problems
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    const isPrivileged = !!user && authorize(user, 'ADMIN', 'FACULTY');
    const { searchParams } = new URL(req.url);

    const eventIdRaw = searchParams.get('eventId');
    const statusRaw = searchParams.get('status');
    const tag = searchParams.get('tag');
    const trackRaw = (searchParams.get('track') || 'open').toLowerCase();

    if (!['open', 'hackathon', 'all'].includes(trackRaw)) {
      return errorRes('Invalid track filter', ['track must be one of: open, hackathon, all'], 400);
    }

    if (!isPrivileged && trackRaw !== 'open') {
      return errorRes('Forbidden', ['Only faculty/admin can view hackathon or all tracks from this endpoint'], 403);
    }

    const where: Record<string, unknown> = {
      status: { not: 'ARCHIVED' },
      ...(isPrivileged ? {} : { mode: 'OPEN', eventId: null }),
    };

    if (eventIdRaw) {
      const eventId = Number(eventIdRaw);
      if (!Number.isInteger(eventId) || eventId <= 0) return errorRes('Invalid eventId filter', ['eventId must be a positive integer'], 400);
      where.eventId = eventId;
    } else if (trackRaw === 'open') {
      where.eventId = null;
      where.mode = 'OPEN';
    } else if (trackRaw === 'hackathon') {
      where.eventId = { not: null };
      where.mode = 'CLOSED';
    }

    if (statusRaw) {
      const normalized = statusRaw.toUpperCase();
      const allowed = ['UNCLAIMED', 'CLAIMED', 'SOLVED', 'ARCHIVED'];
      if (!allowed.includes(normalized)) return errorRes('Invalid status filter', ['status must be a valid ProblemStatus'], 400);
      where.status = normalized;
    }

    if (tag) {
      where.tags = { contains: tag };
    }

    const problems = await prisma.problem.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        event: { select: { id: true, title: true, status: true } },
        _count: { select: { claims: true } },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    return successRes(problems, 'Problems retrieved.');
  } catch (err) {
    console.error('Innovation problems GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// POST /api/innovation/problems
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'FACULTY', 'ADMIN')) return errorRes('Forbidden', ['Faculty or admin access required'], 403);

    const body = await req.json();
    const parsed = innovationProblemCreateSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    let eventForProblem: { id: number; createdById: number } | null = null;
    if (parsed.data.eventId) {
      eventForProblem = await prisma.hackathonEvent.findUnique({
        where: { id: parsed.data.eventId },
        select: { id: true, createdById: true },
      });
      if (!eventForProblem) return errorRes('Invalid eventId', ['Hackathon event not found'], 404);

      if (!authorize(user, 'ADMIN') && eventForProblem.createdById !== user.id) {
        return errorRes('Forbidden', ['You can only add problem statements to events you created'], 403);
      }
    } else if (parsed.data.mode !== 'OPEN') {
      return errorRes('Invalid mode', ['Open innovation problems must be OPEN. Hackathon problems are managed inside event workspace.'], 400);
    }

    const problem = await prisma.problem.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        tags: parsed.data.tags || null,
        mode: parsed.data.eventId ? 'CLOSED' : parsed.data.mode,
        createdById: user.id,
        eventId: parsed.data.eventId ?? null,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        event: { select: { id: true, title: true, status: true } },
      },
    });

    return successRes(problem, 'Problem created successfully.', 201);
  } catch (err) {
    console.error('Innovation problems POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
