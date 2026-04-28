import { NextResponse } from 'next/server';
import { useSecureCookies } from '@/lib/api-helpers';
import { getSharedCookieOptions, SHARED_COOKIE_NAME } from '@/lib/shared-auth';

export async function POST() {
  const secureCookies = useSecureCookies();
  const sharedCookieOptions = getSharedCookieOptions();
  const response = NextResponse.json({ success: true, message: 'Logged out successfully.', data: null });
  response.cookies.set('accessToken', '', {
    httpOnly: true,
    secure: secureCookies,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  response.cookies.set('refreshToken', '', {
    httpOnly: true,
    secure: secureCookies,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  response.cookies.set(SHARED_COOKIE_NAME, '', {
    ...sharedCookieOptions,
    maxAge: 0,
  });
  return response;
}
