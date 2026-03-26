import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { successRes, errorRes } from '@/lib/api-helpers';
import { resetPasswordSchema } from '@/lib/validators';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((e: any) => e.message), 400);
    }

    const email = parsed.data.email.toLowerCase();
    const { otp, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return errorRes('Invalid email or OTP.', [], 400);

    const otpRecord = await prisma.otp.findFirst({
      where: { email, code: otp },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      return errorRes('Invalid email or OTP.', [], 400);
    }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    if (otpRecord.createdAt < tenMinutesAgo) {
      await prisma.otp.delete({ where: { id: otpRecord.id } });
      return errorRes('OTP expired. Please request a new password reset OTP.', [], 400);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });

    await prisma.otp.deleteMany({ where: { email } });

    return successRes(null, 'Password reset successful. You can now log in.');
  } catch (err) {
    console.error('Reset password error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
