import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { getSignedUrl } from '@/lib/minio';

// GET /api/innovation/faculty/open-submissions
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'FACULTY', 'ADMIN')) {
      return errorRes('Forbidden', ['Faculty or admin access required'], 403);
    }

    const where: Record<string, unknown> = {
      status: { in: ['SUBMITTED', 'REVISION_REQUESTED', 'ACCEPTED', 'REJECTED'] },
      problem: {
        mode: 'OPEN',
        eventId: null,
      },
    };

    if (!authorize(user, 'ADMIN')) {
      where.problem = {
        mode: 'OPEN',
        eventId: null,
        createdById: user.id,
      };
    }

    const submissions = await prisma.openSubmission.findMany({
      where,
      include: {
        problem: {
          select: {
            id: true,
            title: true,
            mode: true,
            createdById: true,
          },
        },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, uid: true } },
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    const payload = await Promise.all(
      submissions.map(async (submission) => ({
        ...submission,
        submissionType: 'OPEN' as const,
        technicalDocumentUrl: submission.technicalDocumentKey
          ? await getSignedUrl(submission.technicalDocumentKey).catch(() => null)
          : null,
        pptFileUrl: submission.pptFileKey ? await getSignedUrl(submission.pptFileKey).catch(() => null) : null,
      }))
    );

    return successRes(payload, 'Open submissions retrieved.');
  } catch (err) {
    console.error('Innovation faculty open submissions GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
