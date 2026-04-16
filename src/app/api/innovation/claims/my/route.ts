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
            event: {
              select: {
                id: true,
                title: true,
                status: true,
                startTime: true,
                endTime: true,
                totalSessions: true,
                sessionUploadLocks: {
                  orderBy: { session: 'asc' },
                  select: { session: true, isOpen: true, updatedAt: true },
                },
              },
            },
            createdBy: { select: { id: true, name: true, email: true } },
          },
        },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        sessionDocuments: {
          orderBy: { session: 'asc' },
          select: {
            session: true,
            documentKey: true,
            uploadedAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const hackathonPayload = await Promise.all(
      hackathonClaims.map(async (claim) => {
        const sessionDocuments = await Promise.all(
          claim.sessionDocuments.map(async (doc) => ({
            session: doc.session,
            uploadedAt: doc.uploadedAt,
            documentFileUrl: await getSignedUrl(doc.documentKey).catch(() => null),
          }))
        );
        const totalSessions = claim.problem.event?.totalSessions ?? 1;
        const uploadedSessionSet = new Set(sessionDocuments.map((doc) => doc.session));
        const uploadableSessions = claim.problem.event?.status === 'ACTIVE'
          ? (claim.problem.event.sessionUploadLocks || []).filter((lock) => lock.isOpen).map((lock) => lock.session)
          : [];
        const missingSessions = uploadableSessions.filter((session) => !uploadedSessionSet.has(session));

        const draftUploaded = Boolean(claim.submissionFileKey || claim.submissionUrl);

        return {
          ...claim,
          submissionType: 'HACKATHON' as const,
          submissionFileUrl: claim.submissionFileKey ? await getSignedUrl(claim.submissionFileKey).catch(() => null) : null,
          sessionDocuments,
          documentSummary: {
            requiredCount: 1 + totalSessions,
            uploadedCount: (draftUploaded ? 1 : 0) + sessionDocuments.length,
            missingSessions,
            uploadableSessions,
          },
          technicalDocumentUrl: null,
          pptFileUrl: null,
        };
      })
    );

    return successRes(hackathonPayload, 'My hackathon claims retrieved. For open problem applications, please use /api/innovation/applications/my');
  } catch (err) {
    console.error('Innovation claims/my GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

