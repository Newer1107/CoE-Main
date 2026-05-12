import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { resolveInternshipAccess, InternshipWorkspaceError } from '@/lib/internship-workspace';

const querySchema = z.object({
  id: z.coerce.number().int().positive().optional(),
});

// GET /api/internships
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    if (parsed.data.id) {
      const access = await resolveInternshipAccess(user, parsed.data.id);
      const problem = await prisma.problem.findUnique({
        where: { id: access.problem.id },
        include: {
          industry: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });

      if (!problem) return errorRes('Internship not found', [], 404);

      const participants = await prisma.application.findMany({
        where: {
          problemId: problem.id,
          status: 'SELECTED',
        },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      });

      return successRes(
        {
          id: problem.id,
          title: problem.title,
          status: problem.status,
          approvalStatus: problem.approvalStatus,
          createdAt: problem.createdAt,
          industry: problem.industry,
          createdBy: problem.createdBy,
          participants: participants.map((row) => ({ student: row.user })),
        },
        'Internship retrieved successfully.'
      );
    }

    if (user.role === 'ADMIN') {
      const problems = await prisma.problem.findMany({
        where: { problemType: 'INTERNSHIP' },
        orderBy: { createdAt: 'desc' },
        include: {
          industry: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });

      const counts = await prisma.application.groupBy({
        by: ['problemId'],
        where: { status: 'SELECTED', problemId: { in: problems.map((row) => row.id) } },
        _count: { _all: true },
      });
      const countMap = new Map(counts.map((row) => [row.problemId, row._count._all]));

      return successRes(
        problems.map((problem) => ({
          id: problem.id,
          title: problem.title,
          status: problem.status,
          approvalStatus: problem.approvalStatus,
          createdAt: problem.createdAt,
          industry: problem.industry,
          createdBy: problem.createdBy,
          participantsCount: countMap.get(problem.id) ?? 0,
        })),
        'Internships retrieved successfully.'
      );
    }

    if (user.role === 'INDUSTRY_PARTNER') {
      const industryId = typeof user.industryId === 'number' ? user.industryId : null;
      const problems = await prisma.problem.findMany({
        where: {
          problemType: 'INTERNSHIP',
          OR: [
            ...(industryId ? [{ industryId }] : []),
            { createdById: user.id },
          ],
        },
        orderBy: { createdAt: 'desc' },
        include: {
          industry: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });

      const counts = await prisma.application.groupBy({
        by: ['problemId'],
        where: { status: 'SELECTED', problemId: { in: problems.map((row) => row.id) } },
        _count: { _all: true },
      });
      const countMap = new Map(counts.map((row) => [row.problemId, row._count._all]));

      return successRes(
        problems.map((problem) => ({
          id: problem.id,
          title: problem.title,
          status: problem.status,
          approvalStatus: problem.approvalStatus,
          createdAt: problem.createdAt,
          industry: problem.industry,
          createdBy: problem.createdBy,
          participantsCount: countMap.get(problem.id) ?? 0,
        })),
        'Internships retrieved successfully.'
      );
    }

    const applications = await prisma.application.findMany({
      where: {
        userId: user.id,
        status: 'SELECTED',
        problem: { problemType: 'INTERNSHIP' },
      },
      include: {
        problem: {
          include: {
            industry: { select: { id: true, name: true } },
            createdBy: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return successRes(
      applications.map((app) => ({
        id: app.problem.id,
        title: app.problem.title,
        status: app.problem.status,
        approvalStatus: app.problem.approvalStatus,
        createdAt: app.problem.createdAt,
        industry: app.problem.industry,
        createdBy: app.problem.createdBy,
        participantsCount: 0,
      })),
      'Internships retrieved successfully.'
    );
  } catch (err) {
    if (err instanceof InternshipWorkspaceError) {
      return errorRes(err.message, err.details, err.status);
    }
    console.error('Internships GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
