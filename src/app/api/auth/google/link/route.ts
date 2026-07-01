import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { errorRes, successRes, useSecureCookies } from '@/lib/api-helpers';
import { googleAuthSchema } from '@/lib/validators';
import { verifyGoogleToken } from '@/lib/google-auth';
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
import { logActivity } from '@/lib/activity-log';

const GOOGLE_SIGNIN_ENABLED = process.env.GOOGLE_SIGNIN_ENABLED === 'true';

// In-memory rate limit: 10 req/min/IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    if (!GOOGLE_SIGNIN_ENABLED) {
      return errorRes('Google Sign-In is currently disabled.', ['GOOGLE_FEATURE_DISABLED'], 404);
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip, 10, 60_000)) {
      return errorRes('Too many requests. Try again later.', ['RATE_LIMITED'], 429);
    }

    const body = await req.json();
    const parsed = googleAuthSchema.safeParse(body);
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((e: any) => e.message), 400);
    }

    const { credential } = parsed.data;

    let googlePayload;
    try {
      googlePayload = await verifyGoogleToken(credential);
    } catch {
      logActivity('GOOGLE_ACCOUNT_LINK_FAILED', { error: 'GOOGLE_TOKEN_INVALID' });
      return errorRes('Google authentication failed.', ['GOOGLE_TOKEN_INVALID'], 401);
    }

    const { sub, email } = googlePayload;

    // Find user by email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      logActivity('GOOGLE_ACCOUNT_LINK_FAILED', { email, error: 'USER_NOT_FOUND' });
      return errorRes('Account not found. Please register first.', ['USER_NOT_FOUND'], 404);
    }

    // Status checks — same gates as the main google route
    if (user.status === 'PENDING') {
      logActivity('GOOGLE_PENDING_DENIED', { email });
      return errorRes('Your account is awaiting administrator approval.', ['GOOGLE_ACCOUNT_PENDING'], 403);
    }
    if (user.status === 'REJECTED') {
      logActivity('GOOGLE_REJECTED_DENIED', { email });
      return errorRes('Your account registration was rejected.', ['GOOGLE_ACCOUNT_REJECTED'], 403);
    }

    // Already linked to this Google account — idempotent success
    if (user.googleId === sub) {
      logActivity('GOOGLE_ACCOUNT_LINKED', { email, userId: user.id, previousAuthMethod: 'google' });
      return await issueLinkLoginResponse(user, sub);
    }

    // Already linked to a different Google account
    if (user.googleId && user.googleId !== sub) {
      logActivity('GOOGLE_ACCOUNT_LINK_FAILED', { email, error: 'GOOGLE_ALREADY_LINKED' });
      return errorRes('This account is already linked to a different Google account.', ['GOOGLE_ALREADY_LINKED'], 409);
    }

    // Link Google account
    await prisma.user.update({
      where: { id: user.id },
      data: { googleId: sub },
    });

    logActivity('GOOGLE_ACCOUNT_LINKED', { email, userId: user.id, previousAuthMethod: 'email_password' });

    return await issueLinkLoginResponse(user, sub);
  } catch (err) {
    console.error('Google link error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

async function issueLinkLoginResponse(user: {
  id: number; name: string; email: string; role: string;
  uid: string | null; industryId: number | null; status: string;
}, sub: string) {
  const payload: TokenPayload = {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    industryId: user.industryId,
    ...(user.uid && { uid: user.uid }),
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  const sharedToken = generateSharedToken(buildSharedTokenPayload(user));
  const secureCookies = useSecureCookies();
  const sharedCookieOptions = getSharedCookieOptions();

  const response = successRes({
    accessToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      uid: user.uid,
      industryId: user.industryId,
    },
  }, 'Account linked successfully.');

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
}
