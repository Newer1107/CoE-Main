import { NextRequest } from 'next/server';
import { authenticate, authorize, errorRes } from '@/lib/api-helpers';
import prisma from '@/lib/prisma';
import { getStoredFileDisplayName } from '@/lib/innovation';
import { getSignedUrl } from '@/lib/minio';

type ApplicationStatus = 'SUBMITTED' | 'SELECTED' | 'REJECTED';

const parseStatus = (value: string | null): ApplicationStatus | undefined => {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();
  if (normalized === 'ALL' || normalized.length === 0) return undefined;
  if (normalized === 'SUBMITTED' || normalized === 'SELECTED' || normalized === 'REJECTED') {
    return normalized;
  }
  return undefined;
};

const csvEscape = (value: unknown): string => {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

// GET /api/applications/export
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

    const problemWhere: Record<string, unknown> = {
      problemType: 'INTERNSHIP',
    };

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
          { uid: { contains: search } },
        ],
      };
    }

    const applications = await prisma.application.findMany({
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
    });

    const rows = await Promise.all(
      applications.map(async (app) => {
        const resumeFileName = getStoredFileDisplayName(app.profile?.resumeUrl ?? null);
        const resumeUrl = app.profile?.resumeUrl
          ? await getSignedUrl(app.profile.resumeUrl).catch(() => null)
          : null;
        const answers = app.answers
          .map((ans) => `Q: ${ans.question.questionText} A: ${ans.answerText}`)
          .join(' | ');

        return {
          applicationId: app.id,
          problemId: app.problemId,
          internshipTitle: app.problem.title,
          status: app.status,
          submittedAt: app.createdAt.toISOString(),
          studentName: app.user.name,
          studentEmail: app.user.email,
          studentUid: app.user.uid ?? '',
          skills: app.profile?.skills ?? '',
          experience: app.profile?.experience ?? '',
          interests: app.profile?.interests ?? '',
          resumeFileName: resumeFileName ?? '',
          resumeUrl: resumeUrl ?? '',
          answers,
        };
      })
    );

    const headers = [
      'Application ID',
      'Problem ID',
      'Internship Title',
      'Status',
      'Submitted At',
      'Student Name',
      'Student Email',
      'Student UID',
      'Skills',
      'Experience',
      'Interests',
      'Resume File Name',
      'Resume URL',
      'Answers',
    ];

    const lines = rows.map((row) =>
      [
        row.applicationId,
        row.problemId,
        row.internshipTitle,
        row.status,
        row.submittedAt,
        row.studentName,
        row.studentEmail,
        row.studentUid,
        row.skills,
        row.experience,
        row.interests,
        row.resumeFileName,
        row.resumeUrl,
        row.answers,
      ]
        .map(csvEscape)
        .join(',')
    );

    const csv = [headers.map(csvEscape).join(','), ...lines].join('\n');
    const fileStamp = new Date().toISOString().slice(0, 10);

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="internship-applications-${fileStamp}.csv"`,
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    });
  } catch (err) {
    console.error('Applications export GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
