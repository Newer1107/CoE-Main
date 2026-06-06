import { NextRequest } from 'next/server';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { reviewHostingRequest } from '@/lib/project-hosting';
import { hostingRequestReviewSchema } from '@/lib/validators';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { id } = await params;
    const requestId = Number.parseInt(id, 10);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return errorRes('Validation failed', ['Invalid hosting request id'], 400);
    }

    const body = await req.json();
    const parsed = hostingRequestReviewSchema.safeParse(body);
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    const updated = await reviewHostingRequest(requestId, user.id, parsed.data);
    return successRes(updated, 'Hosting request status updated successfully.');
  } catch (error) {
    console.error('Admin hosting request PATCH error:', error);
    return errorRes(error instanceof Error ? error.message : 'Internal server error', [], error instanceof Error ? 400 : 500);
  }
}
