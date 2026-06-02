import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';

type EmailJobStatus = 'PENDING' | 'PROCESSING' | 'RETRY' | 'SENT' | 'FAILED';

type EmailRetryPayload = {
  status?: EmailJobStatus | 'ALL';
  mode?: 'IMMEDIATE' | 'BULK';
  category?: string;
  ids?: number[];
};

const RETRYABLE_STATUSES: EmailJobStatus[] = ['PENDING', 'PROCESSING', 'RETRY', 'FAILED'];

// POST /api/admin/emails/retry
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const payload = (await req.json().catch(() => ({}))) as EmailRetryPayload;
    const status = payload?.status ?? 'ALL';
    const mode = payload?.mode;
    const category = payload?.category?.trim();
    const ids = Array.isArray(payload?.ids) ? payload.ids.filter((id) => Number.isInteger(id)) : [];

    if (status !== 'ALL' && !RETRYABLE_STATUSES.includes(status)) {
      return errorRes('Validation failed', ['Only pending, processing, retry, or failed jobs can be retried.'], 400);
    }

    const statusFilter = status === 'ALL' ? RETRYABLE_STATUSES : [status];
    const baseWhere: Record<string, unknown> = {
      status: { in: statusFilter },
    };

    if (ids.length > 0) {
      baseWhere.id = { in: ids };
    }

    if (mode && ['IMMEDIATE', 'BULK'].includes(mode)) {
      baseWhere.mode = mode;
    }

    if (category) {
      baseWhere.category = category;
    }

    const now = new Date();
    const nonFailedStatuses = statusFilter.filter((value) => value !== 'FAILED');

    let retriedCount = 0;
    let failedResetCount = 0;

    if (nonFailedStatuses.length > 0) {
      const retryResult = await prisma.emailJob.updateMany({
        where: {
          ...baseWhere,
          status: { in: nonFailedStatuses },
        },
        data: {
          status: 'RETRY',
          nextAttemptAt: now,
          lockedAt: null,
        },
      });
      retriedCount += retryResult.count;
    }

    if (statusFilter.includes('FAILED')) {
      const failedResult = await prisma.emailJob.updateMany({
        where: {
          ...baseWhere,
          status: 'FAILED',
        },
        data: {
          status: 'RETRY',
          attempts: 0,
          nextAttemptAt: now,
          lockedAt: null,
        },
      });
      failedResetCount = failedResult.count;
      retriedCount += failedResult.count;
    }

    return successRes(
      {
        updated: retriedCount,
        failedReset: failedResetCount,
      },
      `Queued ${retriedCount} email job(s) for retry.`,
    );
  } catch (err) {
    console.error('Admin email retry POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
