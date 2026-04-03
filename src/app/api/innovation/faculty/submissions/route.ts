import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { getSignedUrl } from '@/lib/minio';

// GET /api/innovation/faculty/submissions
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const where: Record<string, unknown> = {
      status: { in: ['IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED', 'SHORTLISTED', 'ACCEPTED', 'REJECTED'] },
      problem: {
        eventId: { not: null },
      },
    };

    const claims = await (prisma as any).claim.findMany({
      where,
      include: {
        problem: {
          include: {
            event: { select: { id: true, title: true, status: true } },
          },
        },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, uid: true } },
          },
        },
        tickets: {
          where: { type: 'HACKATHON_SELECTION' },
          orderBy: { issuedAt: 'desc' },
          include: {
            attendanceRecords: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    const payload = await Promise.all(
      claims.map(async (claim: any) => {
        const teamTicket = (claim.tickets || [])[0] || null;
        const attendanceByClaimMemberId = new Map<number, any>();

        for (const row of teamTicket?.attendanceRecords || []) {
          attendanceByClaimMemberId.set(row.claimMemberId, row);
        }

        const memberAttendance = (claim.members || []).map((member: any) => {
          const attendance = attendanceByClaimMemberId.get(member.id);
          return {
            claimMemberId: member.id,
            userId: member.user.id,
            name: member.user.name,
            email: member.user.email,
            role: member.role,
            attendanceStatus: attendance?.status || 'NOT_PRESENT',
            checkedInAt: attendance?.checkedInAt || null,
          };
        });

        const presentCount = memberAttendance.filter((member: any) => member.attendanceStatus === 'PRESENT').length;

        return {
          ...claim,
          submissionType: 'HACKATHON' as const,
          submissionFileUrl: claim.submissionFileKey ? await getSignedUrl(claim.submissionFileKey).catch(() => null) : null,
          teamTicket: teamTicket
            ? {
                ticketId: teamTicket.ticketId,
                status: teamTicket.status,
              }
            : null,
          attendanceSummary: {
            presentCount,
            totalMembers: memberAttendance.length,
            memberAttendance,
          },
        };
      })
    );

    return successRes(payload, 'Claims retrieved.');
  } catch (err) {
    console.error('Innovation faculty submissions GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
