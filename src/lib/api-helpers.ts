import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, TokenPayload } from './jwt';

export const useSecureCookies = (): boolean => {
  return process.env.COOKIE_SECURE === 'true';
};

export const successRes = (data: unknown = null, message = 'Success', status = 200) => {
  return NextResponse.json({ success: true, message, data }, { status });
};

export const errorRes = (message = 'Something went wrong', errors: unknown[] = [], status = 500) => {
  const normalizedErrors = errors
    .map((err) => {
      if (typeof err === 'string') return err.trim();
      if (err instanceof Error) return err.message.trim();
      if (err == null) return '';
      return String(err).trim();
    })
    .filter((err) => err.length > 0);

  let resolvedMessage = message;
  if (message === 'Validation failed' && normalizedErrors.length > 0) {
    resolvedMessage = `Validation failed: ${normalizedErrors[0]}`;
  }

  return NextResponse.json(
    { success: false, message: resolvedMessage, data: null, errors: normalizedErrors },
    { status },
  );
};

/**
 * Authenticate a request via Bearer token.
 * Returns the decoded user payload or null.
 */
export const authenticate = (req: NextRequest): TokenPayload | null => {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      return verifyAccessToken(token);
    } catch {
      return null;
    }
  }

  const cookieToken = req.cookies.get('accessToken')?.value;
  if (!cookieToken) return null;
  try {
    return verifyAccessToken(cookieToken);
  } catch {
    return null;
  }
};

/**
 * Check if the user has one of the allowed roles.
 */
export const authorize = (user: TokenPayload, ...roles: string[]): boolean => {
  if (roles.includes(user.role)) return true;

  // Industry membership is additive: admin/faculty can also act as industry members.
  if (roles.includes('INDUSTRY_PARTNER') && typeof user.industryId === 'number') {
    return true;
  }

  return false;
};
