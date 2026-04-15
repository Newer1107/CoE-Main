import { NextRequest } from 'next/server';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { processEmailQueue } from '@/lib/email-delivery';

function isAuthorizedCron(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  const headerSecret = (req.headers.get('x-cron-secret') || '').trim();
  const querySecret = (new URL(req.url).searchParams.get('secret') || '').trim();

  if (expectedSecret) {
    return headerSecret === expectedSecret || querySecret === expectedSecret;
  }

  const user = authenticate(req);
  return Boolean(user && authorize(user, 'ADMIN'));
}

// GET /api/cron/email-queue
export async function GET(req: NextRequest) {
  try {
    if (!isAuthorizedCron(req)) {
      return errorRes('Forbidden', ['Invalid cron secret'], 403);
    }

    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get('limit') || '50');

    const result = await processEmailQueue(limit);
    return successRes(result, 'Email queue processed successfully.');
  } catch (err) {
    console.error('Email queue cron error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
