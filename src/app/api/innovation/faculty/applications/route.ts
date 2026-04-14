import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { getStoredFileDisplayName } from '@/lib/innovation';
import { getSignedUrl } from '@/lib/minio';

// GET /api/innovation/faculty/applications
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'FACULTY', 'INDUSTRY_PARTNER', 'ADMIN')) {
      return errorRes('Forbidden', ['Faculty, industry partner, or admin access required'], 403);
    }

    const { searchParams } = new URL(req.url);
    const problemIdRaw = searchParams.get('problemId');
    const statusRaw = searchParams.get('status');
    const requester = await prisma.user.findUnique({
      where: { id: user.id },
      select: { industryId: true },
    });

    const where: Record<string, unknown> = {};

    if (problemIdRaw) {
      const problemId = Number(problemIdRaw);
      if (!Number.isInteger(problemId) || problemId <= 0) {
        return errorRes('Invalid filter', ['problemId must be a positive integer'], 400);
      }
      if (authorize(user, 'ADMIN')) {
        where.problemId = problemId;
      } else if (user.role === 'INDUSTRY_PARTNER') {
        if (!requester?.industryId) {
          return errorRes('Forbidden', ['Industry partner account is not linked to an industry. Contact admin.'], 403);
        }
        where.problem = {
          id: problemId,
          industryId: requester.industryId,
          problemType: 'INTERNSHIP',
        };
      } else {
        where.problem = {
          id: problemId,
          createdById: user.id,
        };
      }
    } else if (!authorize(user, 'ADMIN')) {
      if (user.role === 'INDUSTRY_PARTNER') {
        if (!requester?.industryId) {
          return errorRes('Forbidden', ['Industry partner account is not linked to an industry. Contact admin.'], 403);
        }

        where.problem = {
          industryId: requester.industryId,
          problemType: 'INTERNSHIP',
        };
      } else {
        // Faculty can only see applications for their own problems
        where.problem = {
          createdById: user.id,
        };
      }
    }

    if (statusRaw) {
      const validStatuses = ['SUBMITTED', 'SELECTED', 'REJECTED'];
      if (!validStatuses.includes(statusRaw)) {
        return errorRes('Invalid status', ['Status must be one of: SUBMITTED, SELECTED, REJECTED'], 400);
      }
      where.status = statusRaw;
    }

    const applications = await prisma.application.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, uid: true } },
        problem: { select: { id: true, title: true, problemType: true, industryId: true } },
        profile: { select: { skills: true, experience: true, interests: true, resumeUrl: true } },
        answers: {
          include: { question: { select: { id: true, questionText: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const payload = await Promise.all(
      applications.map(async (app) => ({
        ...app,
        profile: {
          ...app.profile,
          resumeFileName: getStoredFileDisplayName(app.profile.resumeUrl),
          resumeUrl: app.profile.resumeUrl ? await getSignedUrl(app.profile.resumeUrl).catch(() => null) : null,
        },
      }))
    );

    return successRes(payload, 'Applications retrieved successfully.');
  } catch (err) {
    console.error('Faculty applications GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

