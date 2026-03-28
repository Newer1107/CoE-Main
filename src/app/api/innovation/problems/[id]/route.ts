import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationProblemUpdateSchema } from '@/lib/validators';

// PATCH /api/innovation/problems/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'FACULTY', 'ADMIN')) return errorRes('Forbidden', ['Faculty or admin access required'], 403);

    const { id } = await params;
    const problemId = Number(id);
    if (!Number.isInteger(problemId) || problemId <= 0) return errorRes('Invalid problem id', [], 400);

    const existing = await prisma.problem.findUnique({ where: { id: problemId } });
    if (!existing) return errorRes('Problem not found', [], 404);

    if (!authorize(user, 'ADMIN') && existing.createdById !== user.id) {
      return errorRes('Forbidden', ['You can only modify your own problems'], 403);
    }

    const body = await req.json();
    const parsed = innovationProblemUpdateSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    if (existing.eventId && typeof parsed.data.mode !== 'undefined' && parsed.data.mode !== 'CLOSED') {
      return errorRes('Invalid mode update', ['Hackathon problem statements must remain CLOSED'], 400);
    }

    if (!existing.eventId && typeof parsed.data.mode !== 'undefined' && parsed.data.mode !== 'OPEN') {
      return errorRes('Invalid mode update', ['Open innovation problems must remain OPEN'], 400);
    }

    const problem = await prisma.problem.update({
      where: { id: problemId },
      data: {
        ...parsed.data,
        tags: parsed.data.tags === '' ? null : parsed.data.tags,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        event: { select: { id: true, title: true, status: true } },
        _count: { select: { claims: true } },
      },
    });

    return successRes(problem, 'Problem updated successfully.');
  } catch (err) {
    console.error('Innovation problems PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// DELETE /api/innovation/problems/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { id } = await params;
    const problemId = Number(id);
    if (!Number.isInteger(problemId) || problemId <= 0) return errorRes('Invalid problem id', [], 400);

    const existing = await prisma.problem.findUnique({ where: { id: problemId } });
    if (!existing) return errorRes('Problem not found', [], 404);

    await prisma.problem.delete({ where: { id: problemId } });
    return successRes(null, 'Problem deleted successfully.');
  } catch (err) {
    console.error('Innovation problems DELETE error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
