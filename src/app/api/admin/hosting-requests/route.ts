import { NextRequest } from 'next/server';
import type { HostingRequestStatus } from '@prisma/client';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { getAdminHostingDashboardData } from '@/lib/project-hosting';

const ALLOWED_STATUSES = new Set<HostingRequestStatus | 'ALL'>([
  'ALL',
  'PENDING',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'CHANGES_REQUESTED',
]);

export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const searchParams = new URL(req.url).searchParams;
    const search = searchParams.get('search')?.trim() || '';
    const statusRaw = searchParams.get('status')?.trim().toUpperCase() || 'ALL';
    const status = ALLOWED_STATUSES.has(statusRaw as HostingRequestStatus | 'ALL')
      ? (statusRaw as HostingRequestStatus | 'ALL')
      : 'ALL';

    const data = await getAdminHostingDashboardData({ search, status });
    return successRes(data, 'Admin hosting requests retrieved successfully.');
  } catch (error) {
    console.error('Admin hosting requests GET error:', error);
    return errorRes('Internal server error', [], 500);
  }
}
