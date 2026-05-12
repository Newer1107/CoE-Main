import { NextRequest } from 'next/server';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import prisma from '@/lib/prisma';
import { getStoredFileDisplayName } from '@/lib/innovation';
import { getSignedUrl } from '@/lib/minio';

type ApplicationStatus = 'SUBMITTED' | 'SELECTED' | 'REJECTED';

const parsePositiveInt = (value: string | null, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
};

const parseBoolean = (value: string | null, fallback = false): boolean => {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return fallback;
};

const parseStatus = (value: string | null): ApplicationStatus | undefined => {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();
  if (normalized === 'ALL' || normalized.length === 0) return undefined;
  if (normalized === 'SUBMITTED' || normalized === 'SELECTED' || normalized === 'REJECTED') {
    return normalized;
  }
  return undefined;
};

// GET /api/applications
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'FACULTY', 'INDUSTRY_PARTNER', 'ADMIN')) {
      return errorRes('Forbidden', ['Faculty, industry partner, or admin access required'], 403);
    }

    const searchParams = new URL(req.url).searchParams;
    const problemTitle = searchParams.get('problemTitle')?.trim() || undefined;
    const search = searchParams.get('search')?.trim() || undefined;
    const status = parseStatus(searchParams.get('status'));
    const page = parsePositiveInt(searchParams.get('page'), 1);
    const pageSize = Math.min(parsePositiveInt(searchParams.get('pageSize'), 25), 100);
    const includeTitles = parseBoolean(searchParams.get('includeTitles'), false);
    const includeIds = parseBoolean(searchParams.get('includeIds'), false);

    const problemWhere: Record<string, unknown> = {
      problemType: 'INTERNSHIP',
    };

    // Strict tenant isolation: industry users can only see their own industry's internship applications.
    if (!authorize(user, 'ADMIN')) {
      const industryId = typeof user.industryId === 'number' ? user.industryId : null;
      if (!industryId) {
        return errorRes('Forbidden', ['Industry context missing for this account'], 403);
      }
      problemWhere.industryId = industryId;
    }

    const where: Record<string, unknown> = {
      problem: problemWhere,
    };

    if (problemTitle) {
      where.problem = {
        ...problemWhere,
        title: problemTitle,
      };
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.user = {
        OR: [
          { name: { contains: search } },
          { email: { contains: search } },
        ],
      };
    }

    const [total, items] = await Promise.all([
      prisma.application.count({ where }),
      prisma.application.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, uid: true } },
          problem: { select: { id: true, title: true } },
          profile: { select: { skills: true, experience: true, interests: true, resumeUrl: true } },
          answers: {
            include: {
              question: { select: { questionText: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const resolvedItems = await Promise.all(
      items.map(async (app) => ({
        ...app,
        profile: {
          ...app.profile,
          resumeFileName: getStoredFileDisplayName(app.profile?.resumeUrl ?? null),
          resumeUrl: app.profile?.resumeUrl
            ? await getSignedUrl(app.profile.resumeUrl).catch(() => null)
            : null,
        },
      }))
    );

    const response: Record<string, unknown> = {
      items: resolvedItems.map((app) => ({
        id: app.id,
        problemTitle: app.problem.title,
        problemId: app.problemId,
        status: app.status,
        createdAt: app.createdAt,
        student: {
          id: app.user.id,
          name: app.user.name,
          email: app.user.email,
          uid: app.user.uid ?? null,
        },
        profile: {
          skills: app.profile?.skills ?? null,
          experience: app.profile?.experience ?? null,
          interests: app.profile?.interests ?? null,
          resumeUrl: app.profile?.resumeUrl ?? null,
          resumeFileName: app.profile?.resumeFileName ?? null,
        },
        answers: app.answers.map((ans) => ({
          id: ans.id,
          question: ans.question.questionText,
          answer: ans.answerText,
        })),
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      titles: [],
      matchingIds: [],
    };

    if (includeTitles) {
      const titles = await prisma.problem.findMany({
        where: where.problem as Record<string, unknown>,
        select: { title: true },
        distinct: ['title'],
        orderBy: { title: 'asc' },
      });
      response.titles = titles.map((row) => row.title);
    }

    if (includeIds) {
      const allMatching = await prisma.application.findMany({
        where,
        select: { id: true },
      });
      response.matchingIds = allMatching.map((row) => row.id);
    }

    return successRes(response, 'Applications retrieved successfully.');
  } catch (err) {
    console.error('Applications GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
