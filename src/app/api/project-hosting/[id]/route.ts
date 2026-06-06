import { NextRequest } from 'next/server';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { getHostingRequestById, updateHostingRequestByStudent } from '@/lib/project-hosting';
import { hostingRequestCreateSchema } from '@/lib/validators';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT', 'ADMIN')) return errorRes('Forbidden', ['Access denied'], 403);

    const { id } = await params;
    const requestId = Number.parseInt(id, 10);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return errorRes('Validation failed', ['Invalid hosting request id'], 400);
    }

    const request = await getHostingRequestById(requestId);
    if (!request) return errorRes('Hosting request not found', [], 404);

    if (user.role === 'STUDENT' && request.student.id !== user.id) {
      return errorRes('Forbidden', ['You can only access your own hosting requests'], 403);
    }

    return successRes(request, 'Hosting request retrieved successfully.');
  } catch (error) {
    console.error('Project hosting item GET error:', error);
    return errorRes('Internal server error', [], 500);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const { id } = await params;
    const requestId = Number.parseInt(id, 10);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return errorRes('Validation failed', ['Invalid hosting request id'], 400);
    }

    const body = await req.json();
    const parsed = hostingRequestCreateSchema.safeParse(body);
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    const updated = await updateHostingRequestByStudent(requestId, user.id, parsed.data);
    return successRes(updated, 'Hosting request updated successfully.');
  } catch (error) {
    console.error('Project hosting item PATCH error:', error);
    return errorRes(error instanceof Error ? error.message : 'Internal server error', [], error instanceof Error ? 400 : 500);
  }
}
