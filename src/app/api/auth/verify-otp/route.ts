import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { successRes, errorRes } from '@/lib/api-helpers';
import { otpVerifySchema } from '@/lib/validators';
import { syncDashboardUser } from '@/lib/dashboard-sync';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = otpVerifySchema.safeParse(body);
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((e: any) => e.message), 400);
    }

    const { email, otp } = parsed.data;

    // Find OTP record
    const otpRecord = await prisma.otp.findFirst({
      where: { email, code: otp },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      return errorRes('Invalid or expired OTP.', [], 400);
    }

    // Check 10-minute TTL
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    if (otpRecord.createdAt < tenMinutesAgo) {
      await prisma.otp.delete({ where: { id: otpRecord.id } });
      return errorRes('OTP expired. Please request a new one.', [], 400);
    }

    // Mark user as verified
    await prisma.user.updateMany({
      where: { email },
      data: { isVerified: true },
    });

    const verifiedUser = await prisma.user.findFirst({
      where: { email },
      select: { email: true, name: true, role: true, uid: true },
    });

    await prisma.otp.deleteMany({ where: { email } });

    if (verifiedUser && verifiedUser.role === 'STUDENT') {
      await syncDashboardUser({
        email: verifiedUser.email,
        name: verifiedUser.name,
        role: verifiedUser.role,
        uid: verifiedUser.uid,
        status: 'ACTIVE',
        isActive: true,
      });
    }

    return successRes(null, 'Email verified successfully. You can now log in.');
  } catch (err) {
    console.error('OTP verify error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
