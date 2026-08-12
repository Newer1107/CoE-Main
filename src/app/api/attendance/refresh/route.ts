import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { deriveErpUid } from '@/lib/erp-attendance';

// POST /api/attendance/refresh — enqueue a sync job (deduped per uid).
export async function POST(req: NextRequest) {
  try {
    if (process.env.ATTENDANCE_ENABLED === 'false') {
      return errorRes('Attendance sync is disabled', [], 403);
    }
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const uid = deriveErpUid(user.email);
    if (!uid) return errorRes('No ERP account linked to this email', [], 400);

    const existing = await prisma.attendanceSyncJob.findFirst({
      where: { uid, status: { in: ['QUEUED', 'RUNNING'] } },
      select: { id: true, status: true },
    });
    if (existing) {
      return successRes({ jobId: existing.id, status: existing.status, deduped: true });
    }
    const job = await prisma.attendanceSyncJob.create({ data: { uid } });
    return successRes({ jobId: job.id, status: job.status, deduped: false });
  } catch (err) {
    console.error('Attendance refresh error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
