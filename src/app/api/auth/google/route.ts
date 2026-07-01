import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
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

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || 'tcetmumbai.in';

// In-memory rate limiting: 30 req/min/IP
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

const GOOGLE_SIGNIN_ENABLED = process.env.GOOGLE_SIGNIN_ENABLED === 'true';

export async function POST(req: NextRequest) {
  try {
    // Feature flag guard
    if (!GOOGLE_SIGNIN_ENABLED) {
      return errorRes('Google Sign-In is currently disabled.', ['GOOGLE_FEATURE_DISABLED'], 404);
    }

    // Rate limit: 30 req/min/IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip, 30, 60_000)) {
      return errorRes('Too many requests. Try again later.', ['RATE_LIMITED'], 429);
    }

    const body = await req.json();
    const parsed = googleAuthSchema.safeParse(body);
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((e: any) => e.message), 400);
    }

    const { credential } = parsed.data;

    // Verify Google ID token
    let googlePayload;
    try {
      googlePayload = await verifyGoogleToken(credential);
    } catch {
      logActivity('GOOGLE_LOGIN_FAILED', { error: 'GOOGLE_TOKEN_INVALID' });
      return errorRes('Google authentication failed.', ['GOOGLE_TOKEN_INVALID'], 401);
    }

    const { sub, email, name, email_verified } = googlePayload;

    // Email must be verified by Google
    if (!email_verified) {
      logActivity('GOOGLE_LOGIN_FAILED', { email, error: 'GOOGLE_EMAIL_NOT_VERIFIED' });
      return errorRes('Google email is not verified.', ['GOOGLE_EMAIL_NOT_VERIFIED'], 403);
    }

    // Domain check
    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      logActivity('GOOGLE_LOGIN_FAILED', { email, error: 'GOOGLE_DOMAIN_INVALID' });
      return successRes({
        action: 'invalid_domain',
        email,
        name,
        error: { code: 'GOOGLE_DOMAIN_INVALID', message: `Use your @${ALLOWED_DOMAIN} email to sign in.` },
      }, 'Domain not allowed.', 403);
    }

    // Look up by googleId first
    const userByGoogleId = await prisma.user.findUnique({ where: { googleId: sub } });
    if (userByGoogleId) {
      // Returning Google user — login
      if (userByGoogleId.status === 'PENDING') {
        logActivity('GOOGLE_PENDING_DENIED', { email });
        return errorRes('Your account is awaiting administrator approval.', ['GOOGLE_ACCOUNT_PENDING'], 403);
      }
      if (userByGoogleId.status === 'REJECTED') {
        logActivity('GOOGLE_REJECTED_DENIED', { email });
        return errorRes('Your account registration was rejected.', ['GOOGLE_ACCOUNT_REJECTED'], 403);
      }

      return await issueLoginResponse(userByGoogleId, sub);
    }

    // Look up by email
    const userByEmail = await prisma.user.findUnique({ where: { email } });
    if (userByEmail) {
      if (userByEmail.googleId) {
        // googleId exists but lookup by googleId above didn't match — different Google account
        logActivity('GOOGLE_ACCOUNT_LINK_FAILED', { email, error: 'GOOGLE_ALREADY_LINKED' });
        return errorRes('This Google account is already linked to a different user.', ['GOOGLE_ALREADY_LINKED'], 409);
      }

      // Existing user without googleId
      if (userByEmail.status === 'PENDING') {
        return errorRes('Your account is awaiting administrator approval.', ['GOOGLE_ACCOUNT_PENDING'], 403);
      }
      if (userByEmail.status === 'REJECTED') {
        return errorRes('Your account registration was rejected.', ['GOOGLE_ACCOUNT_REJECTED'], 403);
      }

      return successRes({
        action: 'link_prompt',
        email,
        name,
        role: userByEmail.role === 'FACULTY' ? 'faculty' : 'student',
      }, 'Link Google account?');
    }

    // New user — registration flow
    // Generate pending_reg JWT
    const regSecret = process.env.GOOGLE_REGISTRATION_SECRET;
    if (!regSecret) {
      return errorRes('Server configuration error.', [], 500);
    }

    const pendingRegToken = jwt.sign(
      { sub, email, name, iat: Math.floor(Date.now() / 1000) },
      regSecret,
      { expiresIn: '15m' },
    );

    logActivity('GOOGLE_REGISTRATION_STARTED', { email, googleId: sub });

    const secureCookies = useSecureCookies();
    const response = successRes({
      action: 'register',
      email,
      name,
    }, 'Complete your registration.');

    response.cookies.set('pending_reg', pendingRegToken, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: 'strict',
      maxAge: 15 * 60,
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('Google auth error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

async function issueLoginResponse(user: {
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
    action: 'login',
    accessToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      uid: user.uid,
      industryId: user.industryId,
    },
  }, 'Login successful.');

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

  logActivity('GOOGLE_LOGIN', { email: user.email, googleId: sub });

  return response;
}
