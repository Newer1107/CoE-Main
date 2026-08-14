import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { deriveStudentInfo } from '@/lib/student-info';

// GET /api/innovation/students/lookup
//   ?uid=24-CSE-B-05&eventId=6  — exact member resolution (name + derived + team check)
//   ?q=24-COMP                  — prefix suggestions while typing (name + uid)
//   ?email=mentor@tcetmumbai.in — faculty/mentor resolution (name or null)
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);

    const q = (req.nextUrl.searchParams.get('q') || '').trim().toUpperCase();
    const email = (req.nextUrl.searchParams.get('email') || '').trim().toLowerCase();

    // mentor resolution
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errorRes('Invalid email', [], 400);
      const mentor = await prisma.user.findFirst({
        where: { email, role: { in: ['FACULTY', 'ADMIN'] }, status: 'ACTIVE', isVerified: true },
        select: { id: true, name: true, email: true },
      });
      return successRes({ found: !!mentor, mentor: mentor ?? null });
    }

    // prefix suggestions while typing a UID
    if (q) {
      const suggestions = await prisma.user.findMany({
        where: { uid: { startsWith: q }, role: 'STUDENT', status: 'ACTIVE', isVerified: true },
        select: { id: true, name: true, uid: true },
        orderBy: { uid: 'asc' },
        take: 8,
      });
      return successRes({
        suggestions: suggestions.map((s) => ({ id: s.id, name: s.name, uid: s.uid, derived: deriveStudentInfo(s.uid) })),
      });
    }

    const uid = (req.nextUrl.searchParams.get('uid') || '').trim().toUpperCase();
    const eventId = Number(req.nextUrl.searchParams.get('eventId'));
    if (!uid || !Number.isInteger(eventId) || eventId <= 0) {
      return errorRes('Missing uid, q, or email', [], 400);
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
