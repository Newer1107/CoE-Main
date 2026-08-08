import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';

// GET /api/profile/innovation-portfolio — student innovation portfolio aggregation.
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    // All hackathon claims the student is a member of, with the linked event.
    const claims = await prisma.claim.findMany({
      where: {
        members: { some: { userId: user.id } },
        problem: { event: { isNot: null } },
      },
      include: {
        problem: { include: { event: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const participated = claims.map((claim) => ({
      eventId: claim.problem.event!.id,
      eventTitle: claim.problem.event!.title,
      eventType: claim.problem.event!.eventType,
      claimStatus: claim.status,
      finalScore: claim.finalScore,
      teamName: claim.teamName,
    }));

    const accepted = claims.filter((claim) => claim.status === 'ACCEPTED');

    const awards = accepted.map((claim) => ({
      eventId: claim.problem.event!.id,
      eventTitle: claim.problem.event!.title,
      finalScore: claim.finalScore,
    }));

    const certificates = accepted.map((claim) => ({
      eventId: claim.problem.event!.id,
      eventTitle: claim.problem.event!.title,
    }));

    const scored = participated.filter((entry) => entry.finalScore != null);
    const avgScore = scored.length > 0
      ? Math.round((scored.reduce((sum, entry) => sum + (entry.finalScore as number), 0) / scored.length) * 100) / 100
      : 0;

    // Attendance from hackathon-selection tickets joined to the student's attendance rows.
    const attendanceRows = await prisma.ticketAttendance.findMany({
      where: {
        userId: user.id,
        ticket: { type: 'HACKATHON_SELECTION' },
      },
      select: {
        status: true,
        session: true,
        ticket: {
          select: {
            id: true,
            subjectName: true,
            claim: {
              select: {
                problem: {
                  select: {
                    event: { select: { title: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const attendanceByTicket = new Map<number, { eventTitle: string; presentCount: number; sessions: Set<number> }>();
    for (const row of attendanceRows) {
      const ticketId = row.ticket.id;
      const eventTitle = row.ticket.claim?.problem?.event?.title ?? row.ticket.subjectName;
      let entry = attendanceByTicket.get(ticketId);
      if (!entry) {
        entry = { eventTitle, presentCount: 0, sessions: new Set<number>() };
        attendanceByTicket.set(ticketId, entry);
      }
      if (row.status === 'PRESENT') entry.presentCount += 1;
      entry.sessions.add(row.session);
    }

    const attendance = Array.from(attendanceByTicket.values()).map((entry) => ({
      eventTitle: entry.eventTitle,
      presentCount: entry.presentCount,
      totalSessions: entry.sessions.size,
    }));

    return successRes(
      {
        totals: {
          participated: participated.length,
          awards: awards.length,
          certificates: certificates.length,
          avgScore,
        },
        participated,
        awards,
        certificates,
        attendance,
      },
      'Innovation portfolio retrieved successfully.',
    );
  } catch (err) {
    console.error('Innovation portfolio GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
