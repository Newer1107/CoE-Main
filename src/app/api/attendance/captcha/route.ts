import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { deriveErpUid, bumpAttendanceStat } from '@/lib/erp-attendance';

async function gate(req: NextRequest): Promise<{ uid: string } | NextResponse> {
  if (process.env.ATTENDANCE_ENABLED === 'false') {
    return errorRes('Attendance sync is disabled', [], 403);
  }
  const user = authenticate(req);
  if (!user) return errorRes('Unauthorized', [], 401);
  const uid = deriveErpUid(user.email);
  if (!uid) return errorRes('No ERP account linked to this email', [], 400);
  return { uid };
}

// GET /api/attendance/captcha?jobId=N — the pending captcha image (owner only).
export async function GET(req: NextRequest) {
  try {
    const g = await gate(req);
    if (g instanceof NextResponse) return g;
    const jobId = Number(req.nextUrl.searchParams.get('jobId'));
    if (!Number.isInteger(jobId)) return errorRes('Invalid job', [], 400);

    const job = await prisma.attendanceSyncJob.findFirst({
      where: { id: jobId },
      select: { uid: true, status: true },
    });
    if (!job || job.uid !== g.uid) return errorRes('Not found', [], 404);
    if (job.status !== 'AWAITING_CAPTCHA') return errorRes('No captcha pending for this job', [], 409);

    try {
      const buf = fs.readFileSync(`/tmp/erp/${jobId}/captcha.png`);
      void bumpAttendanceStat(prisma, 'captcha_asks');
      return new NextResponse(new Uint8Array(buf), {
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
      });
    } catch {
      return errorRes('Captcha image expired — start a new sync', [], 410);
    }
  } catch (err) {
    console.error('Attendance captcha GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// POST /api/attendance/captcha — submit the human-entered text; the worker
// completes the login with the saved session.
export async function POST(req: NextRequest) {
  try {
    const g = await gate(req);
    if (g instanceof NextResponse) return g;
    const body = await req.json().catch(() => null);
    const jobId = Number(body?.jobId);
    const captcha = String(body?.captcha ?? '').trim();
    if (!Number.isInteger(jobId) || !/^[A-Za-z0-9]{4,8}$/.test(captcha)) {
      return errorRes('Validation failed', ['Enter the 4-8 character code from the image.'], 400);
    }

    const job = await prisma.attendanceSyncJob.findFirst({
      where: { id: jobId },
      select: { uid: true, status: true },
    });
    if (!job || job.uid !== g.uid) return errorRes('Not found', [], 404);
    if (job.status !== 'AWAITING_CAPTCHA') return errorRes('No captcha pending for this job', [], 409);

    await prisma.attendanceSyncJob.update({
      where: { id: jobId },
      data: { captchaText: captcha, status: 'QUEUED' },
    });
    return successRes({ submitted: true });
  } catch (err) {
    console.error('Attendance captcha POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
