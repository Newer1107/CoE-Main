import { NextRequest } from 'next/server';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { hubStats } from '@/lib/hub/pipeline';

// GET /api/admin/hub/stats — dashboard rollup (§39)
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);
    return successRes(await hubStats(), 'Hub stats retrieved.');
  } catch (err) {
    console.error('Hub stats error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
