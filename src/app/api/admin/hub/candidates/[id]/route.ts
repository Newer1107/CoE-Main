import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { publishCandidate } from '@/lib/hub/pipeline';

const parseId = (raw: string): number => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : NaN;
};

// PATCH /api/admin/hub/candidates/[id] — { action: verify | reject | publish }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { id } = await params;
    const candidateId = parseId(id);
    if (Number.isNaN(candidateId)) return errorRes('Invalid candidate id', [], 400);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').toLowerCase();
    if (!['verify', 'reject', 'publish'].includes(action)) {
      return errorRes('Validation failed', ['action must be verify, reject or publish'], 400);
    }

    if (action === 'publish') {
      const result = await publishCandidate(candidateId, user.id);
      return successRes(result, result.merged ? 'Candidate published (merged with existing event).' : 'Candidate published.');
    }

    const existing = await (prisma as any).hubCandidate.findUnique({ where: { id: candidateId } });
    if (!existing) return errorRes('Candidate not found', [], 404);
    const updated = await (prisma as any).hubCandidate.update({
      where: { id: candidateId },
      data: action === 'verify'
        ? { status: 'VERIFIED', error: null }
        : { status: 'REJECTED', error: 'Rejected by admin' },
    });
    return successRes(updated, `Candidate ${action === 'verify' ? 'verified' : 'rejected'}.`);
  } catch (err) {
    console.error('Hub candidate PATCH error:', err);
    return errorRes(err instanceof Error ? err.message : 'Action failed', [], 500);
  }
}
