import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { getSignedUrl } from '@/lib/minio';

// GET /api/innovation/claims/my
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);

    const hackathonClaims = await prisma.claim.findMany({
      where: {
        members: {
          some: { userId: user.id },
        },
        problem: {
          eventId: { not: null },
        },
      },
      include: {
        problem: {
          include: {
            event: { select: { id: true, title: true, status: true, startTime: true, endTime: true } },
            createdBy: { select: { id: true, name: true, email: true } },
          },
        },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const openSubmissions = await prisma.openSubmission.findMany({
      where: {
        members: {
          some: { userId: user.id },
        },
      },
      include: {
        problem: {
          include: {
            createdBy: { select: { id: true, name: true, email: true } },
          },
        },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const hackathonPayload = await Promise.all(
      hackathonClaims.map(async (claim) => ({
        ...claim,
        submissionType: 'HACKATHON' as const,
        submissionFileUrl: claim.submissionFileKey ? await getSignedUrl(claim.submissionFileKey).catch(() => null) : null,
        technicalDocumentUrl: null,
        pptFileUrl: null,
      }))
    );

    const openPayload = await Promise.all(
      openSubmissions.map(async (submission) => {
        const isResultVisible = submission.resultPublishedAt !== null;

        return {
          id: submission.id,
          teamName: submission.teamName,
          status: isResultVisible ? submission.status : 'UNDER_REVIEW',
          submissionUrl: null,
          submissionFileUrl: null,
          technicalDocumentUrl: submission.technicalDocumentKey
            ? await getSignedUrl(submission.technicalDocumentKey).catch(() => null)
            : null,
          pptFileUrl: submission.pptFileKey ? await getSignedUrl(submission.pptFileKey).catch(() => null) : null,
          score: isResultVisible ? submission.score : null,
          feedback: isResultVisible ? submission.feedback : null,
          badges: isResultVisible ? submission.badges : null,
          resultVisible: isResultVisible,
          resultPublishedAt: submission.resultPublishedAt,
          updatedAt: submission.updatedAt,
          submissionType: 'OPEN' as const,
          problem: {
            id: submission.problem.id,
            title: submission.problem.title,
            mode: submission.problem.mode,
            status: submission.problem.status,
            event: null,
          },
        };
      })
    );

    const payload = [...hackathonPayload, ...openPayload].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return successRes(payload, 'My claims retrieved.');
  } catch (err) {
    console.error('Innovation claims/my GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
