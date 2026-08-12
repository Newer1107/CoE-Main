import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { deriveErpUid } from '@/lib/erp-attendance';

// GET /api/attendance/status — latest sync job for the session uid (UI polling).
export async function GET(req: NextRequest) {
  try {
    if (process.env.ATTENDANCE_ENABLED === 'false') {
      return errorRes('Attendance sync is disabled', [], 403);
    }
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const uid = deriveErpUid(user.email);
    if (!uid) return successRes({ job: null });

    const job = await prisma.attendanceSyncJob.findFirst({
      where: { uid },
      orderBy: { id: 'desc' },
      select: { id: true, status: true, attempts: true, lastError: true, createdAt: true },
    });
    return successRes({ job });
  } catch (err) {
    console.error('Attendance status error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
