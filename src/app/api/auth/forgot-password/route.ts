import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { successRes, errorRes } from '@/lib/api-helpers';
import { forgotPasswordSchema } from '@/lib/validators';
import { sendPasswordResetOTPEmail } from '@/lib/mailer';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((e: any) => e.message), 400);
    }

    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });

    // Prevent account enumeration by returning a success response either way.
    if (!user) {
      return successRes(null, 'If this email is registered, a reset OTP has been sent.');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await prisma.otp.deleteMany({ where: { email } });
    await prisma.otp.create({ data: { email, code: otp } });

    try {
      await sendPasswordResetOTPEmail(email, otp);
    } catch (emailErr) {
      console.error('Password reset OTP email failed:', emailErr);
    }

    return successRes(null, 'If this email is registered, a reset OTP has been sent.');
  } catch (err) {
    console.error('Forgot password error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
