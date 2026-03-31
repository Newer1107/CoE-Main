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

    const hackathonPayload = await Promise.all(
      hackathonClaims.map(async (claim) => ({
        ...claim,
        submissionType: 'HACKATHON' as const,
        submissionFileUrl: claim.submissionFileKey ? await getSignedUrl(claim.submissionFileKey).catch(() => null) : null,
        technicalDocumentUrl: null,
        pptFileUrl: null,
      }))
    );

    return successRes(hackathonPayload, 'My hackathon claims retrieved. For open problem applications, please use /api/innovation/applications/my');
  } catch (err) {
    console.error('Innovation claims/my GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

