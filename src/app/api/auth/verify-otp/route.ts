import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { errorRes, useSecureCookies } from '@/lib/api-helpers';
import { otpVerifySchema } from '@/lib/validators';
import { syncDashboardUser } from '@/lib/dashboard-sync';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  SHARED_TOKEN_TTL_SECONDS,
  generateAccessToken,
  generateRefreshToken,
  generateSharedToken,
  TokenPayload,
} from '@/lib/jwt';
import { buildSharedTokenPayload, getSharedCookieOptions, SHARED_COOKIE_NAME } from '@/lib/shared-auth';

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
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    if (otpRecord.createdAt < thirtyMinutesAgo) {
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
      select: { id: true, email: true, name: true, role: true, uid: true, status: true, industryId: true, facultyProfile: { select: { isHod: true } } },
    });

    await prisma.otp.deleteMany({ where: { email } });

    if (!verifiedUser) {
      return errorRes('User not found after verification.', [], 500);
    }

    // Fire-and-forget dashboard sync
    if (verifiedUser.role === 'STUDENT') {
      syncDashboardUser({
        email: verifiedUser.email,
        name: verifiedUser.name,
        role: verifiedUser.role,
        uid: verifiedUser.uid,
        status: 'ACTIVE',
        isActive: true,
      });
    }

    // Auto-login: generate auth tokens and set cookies
    const payload: TokenPayload = {
      id: verifiedUser.id,
      role: verifiedUser.role,
      name: verifiedUser.name,
      email: verifiedUser.email,
      industryId: verifiedUser.industryId,
      ...(verifiedUser.uid && { uid: verifiedUser.uid }),
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    const sharedToken = generateSharedToken(buildSharedTokenPayload({ ...verifiedUser, isHod: verifiedUser.facultyProfile?.isHod }));
    const secureCookies = useSecureCookies();
    const sharedCookieOptions = getSharedCookieOptions();

    const response = NextResponse.json({
      success: true,
      message: 'Email verified successfully.',
      data: {
        accessToken,
        user: {
          id: verifiedUser.id,
          name: verifiedUser.name,
          email: verifiedUser.email,
          role: verifiedUser.role,
          uid: verifiedUser.uid,
          industryId: verifiedUser.industryId,
        },
      },
    });

    response.cookies.set('accessToken', accessToken, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: 'lax',
      maxAge: ACCESS_TOKEN_TTL_SECONDS,
      path: '/',
    });
    response.cookies.set('refreshToken', refreshToken, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: 'lax',
      maxAge: REFRESH_TOKEN_TTL_SECONDS,
      path: '/',
    });
    response.cookies.set(SHARED_COOKIE_NAME, sharedToken, {
      ...sharedCookieOptions,
      maxAge: SHARED_TOKEN_TTL_SECONDS,
    });

    return response;
  } catch (err) {
    console.error('OTP verify error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
