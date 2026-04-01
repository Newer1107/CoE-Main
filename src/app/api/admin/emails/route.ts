import { NextRequest } from 'next/server';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { getEmailQueueSnapshot } from '@/lib/email-delivery';

// GET /api/admin/emails
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { searchParams } = new URL(req.url);

    const status = searchParams.get('status') || undefined;
    const mode = searchParams.get('mode') || undefined;
    const category = searchParams.get('category') || undefined;
    const page = Number(searchParams.get('page') || '1');
    const pageSize = Number(searchParams.get('pageSize') || '25');

    const snapshot = await getEmailQueueSnapshot({
      status,
      mode,
      category,
      page,
      pageSize,
    });

    return successRes(snapshot, 'Email activity retrieved successfully.');
  } catch (err) {
    console.error('Admin emails GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
