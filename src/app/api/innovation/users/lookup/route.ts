import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { parseStringList } from '@/lib/innovation';

// GET /api/innovation/users/lookup?uids=["24-COMPD13-28","24-COMPD13-31"]
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const rawUids = req.nextUrl.searchParams.get('uids');
    const normalizedUids = parseStringList(rawUids)
      .map((uid) => uid.trim().toUpperCase())
      .filter((uid) => uid.length > 0);

    if (normalizedUids.length === 0) {
      return errorRes('Validation failed', ['At least one UID is required for lookup'], 400);
    }

    if (normalizedUids.length > 10) {
      return errorRes('Validation failed', ['You can verify up to 10 UIDs at once'], 400);
    }

    const users = await prisma.user.findMany({
      where: { uid: { in: normalizedUids } },
      select: {
        uid: true,
        name: true,
        email: true,
        role: true,
        status: true,
        isVerified: true,
      },
    });

    const userByUid = new Map(users.map((entry) => [entry.uid?.toUpperCase(), entry]));

    const result = normalizedUids.map((uid) => {
      const found = userByUid.get(uid);
      if (!found) {
        return {
          uid,
          found: false,
          eligible: false,
          name: null,
          email: null,
          role: null,
          status: null,
          isVerified: null,
        };
      }

      const eligible = found.role === 'STUDENT' && found.status === 'ACTIVE' && found.isVerified;
      return {
        uid,
        found: true,
        eligible,
        name: found.name,
        email: found.email,
        role: found.role,
        status: found.status,
        isVerified: found.isVerified,
      };
    });

    return successRes(result, 'UID lookup successful');
  } catch (err) {
    console.error('Innovation user lookup GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
