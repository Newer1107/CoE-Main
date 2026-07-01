import { NextRequest } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { errorRes, successRes, useSecureCookies } from '@/lib/api-helpers';
import { googleRegistrationSchema } from '@/lib/validators';
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
import { syncDashboardUser } from '@/lib/dashboard-sync';

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || 'tcetmumbai.in';
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

    // Read and verify pending_reg cookie
    const pendingRegToken = req.cookies.get('pending_reg')?.value;
    if (!pendingRegToken) {
      return errorRes('Registration session not found. Please sign in with Google again.', ['GOOGLE_REGISTRATION_MISSING'], 401);
    }

    const regSecret = process.env.GOOGLE_REGISTRATION_SECRET;
    if (!regSecret) {
      return errorRes('Server configuration error.', ['SERVER_CONFIG_ERROR'], 500);
    }

    let pendingPayload: { sub: string; email: string; name: string };
    try {
      pendingPayload = jwt.verify(pendingRegToken, regSecret) as { sub: string; email: string; name: string };
    } catch (err) {
      const isExpired = err instanceof jwt.TokenExpiredError;
      return errorRes(
        isExpired ? 'Your registration session has expired. Please sign in with Google again.' : 'Invalid registration session.',
        [isExpired ? 'GOOGLE_REGISTRATION_EXPIRED' : 'GOOGLE_REGISTRATION_INVALID'],
        401,
      );
    }

    const { sub, email } = pendingPayload;

    // Re-verify domain (defense in depth)
    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return errorRes(`Use your @${ALLOWED_DOMAIN} email to register.`, ['GOOGLE_DOMAIN_INVALID'], 403);
    }

    // Validate form body
    const body = await req.json();
    const parsed = googleRegistrationSchema.safeParse(body);
    if (!parsed.success) {
      // pending_reg cookie preserved — user can retry
      return errorRes('Validation failed', parsed.error.issues.map((e: any) => e.message), 400);
    }

    const { name, uid, phone } = parsed.data;

    // Generate random password (Option B from spec — satisfies NOT NULL, never used for auth)
    const randomPw = crypto.randomBytes(32).toString('hex');
    const hashedRandomPw = await bcrypt.hash(randomPw, 12);

    // Prisma transaction: atomic uniqueness checks + user creation
    const user = await prisma.$transaction(async (tx) => {
      const [emailUser, uidUser, gidUser] = await Promise.all([
        tx.user.findUnique({ where: { email } }),
        tx.user.findUnique({ where: { uid } }),
        tx.user.findUnique({ where: { googleId: sub } }),
      ]);

      if (emailUser) {
        throw new ApiRegistrationError('EMAIL_EXISTS', 'This email was already registered while you were completing the form.');
      }
      if (uidUser) {
        throw new ApiRegistrationError('UID_EXISTS', 'This UID is already registered.');
      }
      if (gidUser) {
        throw new ApiRegistrationError('GOOGLE_ALREADY_LINKED', 'This Google account was already linked.');
      }

      return tx.user.create({
        data: {
          name,
          email,
          phone,
          uid,
          password: hashedRandomPw,
          googleId: sub,
          role: 'STUDENT',
          isVerified: true,
          status: 'ACTIVE',
        },
      });
    });

    // Everything below is OUTSIDE the transaction
    // Clear pending_reg cookie
    const secureCookies = useSecureCookies();

    logActivity('GOOGLE_REGISTRATION_COMPLETED', { email, userId: user.id });

    // Generate 3 JWT tokens
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
    }, 'Registration completed successfully.');

    response.cookies.set('pending_reg', '', {
      httpOnly: true,
      secure: secureCookies,
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
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

    // Dashboard sync — fire and forget, never blocks login
    syncDashboardUser({
      email: user.email,
      name: user.name,
      role: user.role,
      uid: user.uid,
      status: 'ACTIVE',
      isActive: true,
    }).catch((err) => {
      logActivity('DASHBOARD_SYNC_FAILED', { email: user.email, error: String(err) });
    });

    return response;
  } catch (err) {
    if (err instanceof ApiRegistrationError) {
      // pending_reg cookie is preserved on validation errors
      return errorRes(err.message, [err.code], err.status);
    }
    // Handle Prisma unique constraint violation (P2002) in case of race condition
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[])?.join(', ') || 'field';
      if (target.includes('email')) {
        return errorRes('This email was already registered.', ['EMAIL_EXISTS'], 409);
      }
      if (target.includes('uid')) {
        return errorRes('This UID is already registered.', ['UID_EXISTS'], 409);
      }
      if (target.includes('googleId')) {
        return errorRes('This Google account was already linked.', ['GOOGLE_ALREADY_LINKED'], 409);
      }
    }
    console.error('Google registration error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

class ApiRegistrationError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.status = code === 'EMAIL_EXISTS' ? 409 : 409;
  }
}
