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

    const registrationTypeRaw = (req.nextUrl.searchParams.get('registrationType') || 'hackathon').toLowerCase();
    const rawUids = req.nextUrl.searchParams.get('uids');
    const eventId = Number(req.nextUrl.searchParams.get('eventId'));
    const problemId = Number(req.nextUrl.searchParams.get('problemId'));
    const normalizedUids = parseStringList(rawUids)
      .map((uid) => uid.trim().toUpperCase())
      .filter((uid) => uid.length > 0);

    if (!['hackathon', 'open'].includes(registrationTypeRaw)) {
      return errorRes('Validation failed', ['registrationType must be either hackathon or open'], 400);
    }

    if (normalizedUids.length === 0) {
      return errorRes('Validation failed', ['At least one UID is required for lookup'], 400);
    }

    if (normalizedUids.length > 10) {
      return errorRes('Validation failed', ['You can verify up to 10 UIDs at once'], 400);
    }

    if (!Number.isInteger(problemId) || problemId <= 0) {
      return errorRes('Validation failed', ['A valid problemId is required for lookup'], 400);
    }

    if (registrationTypeRaw === 'hackathon' && (!Number.isInteger(eventId) || eventId <= 0)) {
      return errorRes('Validation failed', ['A valid eventId is required for hackathon lookup'], 400);
    }

    const problem = await prisma.problem.findFirst({
      where:
        registrationTypeRaw === 'hackathon'
          ? { id: problemId, eventId }
          : { id: problemId, eventId: null, mode: 'OPEN', status: 'OPENED' },
      select: { id: true },
    });

    if (!problem) {
      return errorRes(
        'Invalid problem selection',
        [registrationTypeRaw === 'hackathon' ? 'Selected problem is not part of this event' : 'Selected open problem statement is not valid'],
        400
      );
    }

    const users = await prisma.user.findMany({
      where: { uid: { in: normalizedUids } },
      select: {
        id: true,
        uid: true,
        name: true,
        email: true,
        role: true,
        status: true,
        isVerified: true,
      },
    });

    const userIds = users.map((entry) => entry.id);

    const participatedUserIds = new Set<number>();

    if (userIds.length > 0) {
      if (registrationTypeRaw === 'hackathon') {
        const participationRows = await prisma.claimMember.findMany({
          where: {
            userId: { in: userIds },
            claim: {
              problem: { eventId },
            },
          },
          select: { userId: true },
        });

        participationRows.forEach((entry) => participatedUserIds.add(entry.userId));
      } else {
        // For open problems, check Applications instead of OpenSubmissionMembers
        const applicationRows = await prisma.application.findMany({
          where: {
            userId: { in: userIds },
            problemId,
          },
          select: { userId: true },
        });

        applicationRows.forEach((entry) => participatedUserIds.add(entry.userId));
      }
    }

    const userByUid = new Map(users.map((entry) => [entry.uid?.toUpperCase(), entry]));

    const result = normalizedUids.map((uid) => {
      const found = userByUid.get(uid);
      if (!found) {
        return {
          uid,
          found: false,
          eligible: false,
          alreadyParticipated: false,
          reason: 'UID not found. Ask this student to register first.',
          name: null,
          email: null,
          role: null,
          status: null,
          isVerified: null,
        };
      }

      const isStudent = found.role === 'STUDENT';
      const isActive = found.status === 'ACTIVE';
      const isVerified = Boolean(found.isVerified);
      const alreadyParticipated = participatedUserIds.has(found.id);

      let reason =
        registrationTypeRaw === 'hackathon'
          ? 'Eligible for this hackathon problem statement.'
          : 'Eligible for this open problem statement.';
      if (!isStudent) {
        reason = 'User is not a student account.';
      } else if (!isActive) {
        reason = 'User account is not active.';
      } else if (!isVerified) {
        reason = 'User account is not verified.';
      } else if (alreadyParticipated) {
        reason =
          registrationTypeRaw === 'hackathon'
            ? 'This user is already registered in a team for this hackathon event.'
            : 'This user has already participated in this open problem statement.';
      }

      const eligible = isStudent && isActive && isVerified && !alreadyParticipated;

      return {
        uid,
        found: true,
        eligible,
        alreadyParticipated,
        reason,
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
