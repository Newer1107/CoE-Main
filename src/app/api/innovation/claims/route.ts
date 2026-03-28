import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes } from '@/lib/api-helpers';
import { innovationClaimCreateSchema } from '@/lib/validators';

// POST /api/innovation/claims
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const body = await req.json();
    const parsed = innovationClaimCreateSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const problem = await prisma.problem.findUnique({
      where: { id: parsed.data.problemId },
      include: { createdBy: { select: { id: true, email: true, name: true } }, event: true },
    });
    if (!problem) return errorRes('Problem not found', [], 404);
    if (problem.status === 'ARCHIVED') return errorRes('Problem is archived', [], 400);
    if (problem.eventId) return errorRes('Use event registration for hackathon problems', [], 400);
    return errorRes('Open statement registration moved', ['Use /api/innovation/open-submissions for open problem statement registration'], 400);
  } catch (err) {
    console.error('Innovation claims POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
