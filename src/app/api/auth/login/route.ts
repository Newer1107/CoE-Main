import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { successRes, errorRes, useSecureCookies } from '@/lib/api-helpers';
import { loginSchema } from '@/lib/validators';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  generateAccessToken,
  generateRefreshToken,
  TokenPayload,
} from '@/lib/jwt';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((e: any) => e.message), 400);
    }

    const { identifier, password } = parsed.data;
    const normalizedIdentifier = identifier.trim();
    const normalizedEmail = normalizedIdentifier.toLowerCase();
    const normalizedUid = normalizedIdentifier.toUpperCase();

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: normalizedEmail }, { uid: normalizedUid }],
      },
    });
    if (!user) {
      return errorRes('Invalid email/UID or password.', [], 401);
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return errorRes('Invalid email/UID or password.', [], 401);
    }

    if (user.role === 'STUDENT' && !user.isVerified) {
      return NextResponse.json(
        { success: false, message: 'Please verify your email with the OTP.', needsVerification: true, email: user.email },
        { status: 403 }
      );
    }

    // Check status (faculty pending/rejected)
    if (user.status === 'PENDING') {
      return errorRes('Your account is pending admin approval.', [], 403);
    }
    if (user.status === 'REJECTED') {
      return errorRes('Your account registration was rejected.', [], 403);
    }

    const payload: TokenPayload = {
      id: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      ...(user.uid && { uid: user.uid }),
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    const secureCookies = useSecureCookies();

    const response = NextResponse.json({
      success: true,
      message: 'Login successful.',
      data: { accessToken, user: { id: user.id, name: user.name, email: user.email, role: user.role, uid: user.uid } },
    });

    response.cookies.set('accessToken', accessToken, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: 'lax',
      maxAge: ACCESS_TOKEN_TTL_SECONDS,
      path: '/',
    });

    // Set refresh token in httpOnly cookie
    response.cookies.set('refreshToken', refreshToken, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: 'lax',
      maxAge: REFRESH_TOKEN_TTL_SECONDS,
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('Login error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
