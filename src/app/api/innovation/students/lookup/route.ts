import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { deriveStudentInfo } from '@/lib/student-info';

// GET /api/innovation/students/lookup?uid=24-CSE-B-05&eventId=6
// Member resolution for team registration: name + UID-derived details + whether
// the student is already on a team for this event. Student auth only.
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);

    const uid = (req.nextUrl.searchParams.get('uid') || '').trim().toUpperCase();
    const eventId = Number(req.nextUrl.searchParams.get('eventId'));
    if (!uid || !Number.isInteger(eventId) || eventId <= 0) {
      return errorRes('Missing uid or eventId', [], 400);
    }

    const student = await prisma.user.findFirst({
      where: { uid, role: 'STUDENT', status: 'ACTIVE', isVerified: true },
      select: { id: true, name: true, uid: true },
    });
    if (!student) return successRes({ found: false, uid });

    const inTeamForEvent =
      (await prisma.claimMember.count({
        where: {
          userId: student.id,
          claim: { problem: { eventId } },
        },
      })) > 0;

    return successRes({
      found: true,
      uid: student.uid,
      name: student.name,
      derived: deriveStudentInfo(student.uid),
      inTeamForEvent,
    });
  } catch (err) {
    console.error('Student lookup error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
