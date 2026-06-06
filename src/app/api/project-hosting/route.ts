import { NextRequest } from 'next/server';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { createHostingRequest, getStudentHostingDashboardData } from '@/lib/project-hosting';
import { hostingRequestCreateSchema } from '@/lib/validators';

export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const data = await getStudentHostingDashboardData(user.id);
    return successRes(data, 'Hosting requests retrieved successfully.');
  } catch (error) {
    console.error('Project hosting GET error:', error);
    return errorRes('Internal server error', [], 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const body = await req.json();
    const parsed = hostingRequestCreateSchema.safeParse(body);
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    const created = await createHostingRequest(user.id, parsed.data);
    return successRes(created, 'Hosting request submitted successfully.', 201);
  } catch (error) {
    console.error('Project hosting POST error:', error);
    return errorRes(error instanceof Error ? error.message : 'Internal server error', [], error instanceof Error ? 400 : 500);
  }
}
