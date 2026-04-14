import { NextRequest, NextResponse } from 'next/server';
import { successRes, errorRes, useSecureCookies } from '@/lib/api-helpers';
import { ACCESS_TOKEN_TTL_SECONDS, verifyRefreshToken, generateAccessToken, TokenPayload } from '@/lib/jwt';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const refreshToken = req.cookies.get('refreshToken')?.value;
    if (!refreshToken) {
      return errorRes('No refresh token provided.', [], 401);
    }

    const decoded = verifyRefreshToken(refreshToken) as TokenPayload;
    const currentUser = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        role: true,
        name: true,
        email: true,
        uid: true,
        industryId: true,
      },
    });

    if (!currentUser) {
      return errorRes('User not found.', [], 401);
    }

    const payload: TokenPayload = {
      id: currentUser.id,
      role: currentUser.role,
      name: currentUser.name,
      email: currentUser.email,
      industryId: currentUser.industryId,
      ...(currentUser.uid && { uid: currentUser.uid }),
    };

    const accessToken = generateAccessToken(payload);
    const secureCookies = useSecureCookies();

    const response = successRes({ accessToken }, 'Token refreshed successfully.');
    response.cookies.set('accessToken', accessToken, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: 'lax',
      maxAge: ACCESS_TOKEN_TTL_SECONDS,
      path: '/',
    });

    return response;
  } catch {
    return errorRes('Invalid or expired refresh token.', [], 401);
  }
}
