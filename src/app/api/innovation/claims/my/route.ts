import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { getSignedUrl } from '@/lib/minio';

// GET /api/innovation/claims/my
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);

    const claims = await prisma.claim.findMany({
      where: {
        members: {
          some: { userId: user.id },
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

    const payload = await Promise.all(
      claims.map(async (claim) => ({
        ...claim,
        submissionFileUrl: claim.submissionFileKey ? await getSignedUrl(claim.submissionFileKey).catch(() => null) : null,
      }))
    );

    return successRes(payload, 'My claims retrieved.');
  } catch (err) {
    console.error('Innovation claims/my GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
