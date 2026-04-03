import { NextRequest } from 'next/server';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';

// PATCH /api/innovation/faculty/claims/[id]/attendance
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { id } = await params;
    const claimId = Number(id);
    if (!Number.isInteger(claimId) || claimId <= 0) return errorRes('Invalid claim id', [], 400);
    return successRes(
      { claimId },
      'Team-level attendance is deprecated. Use ticket check-in to mark individual member attendance.'
    );
  } catch (err) {
    console.error('Innovation attendance PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
