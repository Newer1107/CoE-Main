import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationClaimAttendanceSchema } from '@/lib/validators';

// PATCH /api/innovation/faculty/claims/[id]/attendance
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'FACULTY', 'ADMIN')) return errorRes('Forbidden', ['Faculty or admin access required'], 403);

    const { id } = await params;
    const claimId = Number(id);
    if (!Number.isInteger(claimId) || claimId <= 0) return errorRes('Invalid claim id', [], 400);

    const body = await req.json();
    const parsed = innovationClaimAttendanceSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      include: {
        problem: {
          select: {
            createdById: true,
            eventId: true,
          },
        },
      },
    });

    if (!claim) return errorRes('Claim not found', [], 404);
    if (!claim.problem.eventId) return errorRes('Invalid claim', ['Attendance tracking is available only for hackathon submissions'], 400);

    if (!authorize(user, 'ADMIN') && claim.problem.createdById !== user.id) {
      return errorRes('Forbidden', ['You can only update attendance for your own problem submissions'], 403);
    }

    const updated = await prisma.claim.update({
      where: { id: claimId },
      data: {
        isAbsent: parsed.data.isAbsent,
      } as any,
    });

    return successRes(updated, parsed.data.isAbsent ? 'Team marked as absent.' : 'Team marked as present.');
  } catch (err) {
    console.error('Innovation attendance PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
