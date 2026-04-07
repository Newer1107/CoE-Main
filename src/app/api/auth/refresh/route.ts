import { NextRequest, NextResponse } from 'next/server';
import { successRes, errorRes, useSecureCookies } from '@/lib/api-helpers';
import { verifyRefreshToken, generateAccessToken, TokenPayload } from '@/lib/jwt';

export async function POST(req: NextRequest) {
  try {
    const refreshToken = req.cookies.get('refreshToken')?.value;
    if (!refreshToken) {
      return errorRes('No refresh token provided.', [], 401);
    }

    const decoded = verifyRefreshToken(refreshToken) as TokenPayload;
    const payload: TokenPayload = {
      id: decoded.id,
      role: decoded.role,
      name: decoded.name,
      email: decoded.email,
      ...(decoded.uid && { uid: decoded.uid }),
    };

    const accessToken = generateAccessToken(payload);
    const secureCookies = useSecureCookies();

    const response = successRes({ accessToken }, 'Token refreshed successfully.');
    response.cookies.set('accessToken', accessToken, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: 'lax',
      maxAge: 15 * 60,
      path: '/',
    });

    return response;
  } catch {
    return errorRes('Invalid or expired refresh token.', [], 401);
  }
}
