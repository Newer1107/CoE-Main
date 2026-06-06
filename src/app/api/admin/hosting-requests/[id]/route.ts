import { NextRequest } from 'next/server';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { getHostingRequestById } from '@/lib/project-hosting';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { id } = await params;
    const requestId = Number.parseInt(id, 10);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return errorRes('Validation failed', ['Invalid hosting request id'], 400);
    }

    const request = await getHostingRequestById(requestId);
    if (!request) return errorRes('Hosting request not found', [], 404);

    return successRes(request, 'Hosting request retrieved successfully.');
  } catch (error) {
    console.error('Admin hosting request GET error:', error);
    return errorRes('Internal server error', [], 500);
  }
}
