import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { getSignedUrl } from '@/lib/minio';

// GET /api/innovation/faculty/submissions
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'FACULTY', 'ADMIN')) return errorRes('Forbidden', ['Faculty or admin access required'], 403);

    const where: Record<string, unknown> = {
      status: { in: ['IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED', 'SHORTLISTED', 'ACCEPTED', 'REJECTED'] },
    };

    if (!authorize(user, 'ADMIN')) {
      where.problem = { createdById: user.id };
    }

    const claims = await prisma.claim.findMany({
      where,
      include: {
        problem: {
          include: {
            event: { select: { id: true, title: true, status: true } },
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
      claims.map(async (claim) => ({
        ...claim,
        submissionFileUrl: claim.submissionFileKey ? await getSignedUrl(claim.submissionFileKey).catch(() => null) : null,
      }))
    );

    return successRes(payload, 'Claims retrieved.');
  } catch (err) {
    console.error('Innovation faculty submissions GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
