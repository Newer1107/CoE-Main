import type { SharedTokenPayload } from './jwt';

export const SHARED_COOKIE_NAME = 'coe_shared_token';

export const getSharedCookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    domain: isProd ? '.tcetcercd.in' : '.localhost',
  };
};

const roleMap: Record<string, SharedTokenPayload['role']> = {
  ADMIN: 'ADMIN',
  FACULTY: 'FACULTY',
  STUDENT: 'STUDENT',
  INDUSTRY_PARTNER: 'INDUSTRY',
};

export const buildSharedTokenPayload = (user: {
  email: string;
  role: string;
  status: string;
}): SharedTokenPayload => {
  const mappedRole = roleMap[user.role];
  if (!mappedRole) {
    throw new Error(`Unsupported role for shared auth token: ${user.role}`);
  }

  return {
    email: user.email,
    role: mappedRole,
    status: user.status as SharedTokenPayload['status'],
  };
};
