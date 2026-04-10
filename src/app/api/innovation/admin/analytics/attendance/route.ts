import { ClaimStatus, MemberAttendanceStatus, Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import {
  buildInnovationAnalyticsClaimWhere,
  getPagination,
  mapClaimStatusToStage,
  parseInnovationAnalyticsFilters,
} from '@/lib/innovation-analytics';
import prisma from '@/lib/prisma';

type AttendanceRow = {
  claimMemberId: number;
  session: number;
  status: MemberAttendanceStatus;
  checkedInAt: Date | null;
  checkedInBy: {
    id: number;
    name: string;
    email: string;
  } | null;
};

const buildAttendanceTeamRows = (
  claims: Array<{
    id: number;
    teamName: string | null;
    status: ClaimStatus;
    updatedAt: Date;
    problem: {
      id: number;
      title: string;
      event: {
        id: number;
        title: string;
        totalSessions: number;
      } | null;
    };
    members: Array<{
      id: number;
      role: string;
      user: {
        id: number;
        name: string;
        email: string;
        phone: string | null;
        uid: string | null;
      };
    }>;
    tickets: Array<{
      id: number;
      ticketId: string;
      status: string;
      attendanceRecords: AttendanceRow[];
    }>;
  }>,
  targetSession: number
) => {
  return claims.map((claim) => {
    const teamTicket = claim.tickets[0] || null;
    const totalSessions = claim.problem.event?.totalSessions ?? 1;
    const effectiveSession = Math.min(targetSession, totalSessions);

    const attendanceBySession = new Map<number, Map<number, AttendanceRow>>();
    for (const row of teamTicket?.attendanceRecords || []) {
      if (!attendanceBySession.has(row.session)) {
        attendanceBySession.set(row.session, new Map<number, AttendanceRow>());
      }
      attendanceBySession.get(row.session)?.set(row.claimMemberId, row);
    }

    const activeSessionAttendance = attendanceBySession.get(effectiveSession) || new Map<number, AttendanceRow>();

    const members = claim.members.map((member) => {
      const attendance = activeSessionAttendance.get(member.id);
      const status = attendance?.status || 'NOT_PRESENT';
      return {
        claimMemberId: member.id,
        userId: member.user.id,
        name: member.user.name,
        email: member.user.email,
        phone: member.user.phone,
        uid: member.user.uid,
        role: member.role === 'LEAD' ? 'Leader' : 'Member',
        attendanceStatus: status,
        markedTime: attendance?.checkedInAt ? attendance.checkedInAt.toISOString() : null,
        markedBy: attendance?.checkedInBy
          ? {
              id: attendance.checkedInBy.id,
              name: attendance.checkedInBy.name,
              email: attendance.checkedInBy.email,
            }
          : null,
      };
    });

    const presentCount = members.filter((member) => member.attendanceStatus === 'PRESENT').length;
    const totalMembers = members.length;
    const attendancePercentage = totalMembers > 0 ? Number(((presentCount / totalMembers) * 100).toFixed(2)) : 0;

    const perSessionSummary = Array.from({ length: totalSessions }, (_, index) => {
      const session = index + 1;
      const rows = attendanceBySession.get(session) || new Map<number, AttendanceRow>();
      const sessionPresentCount = Array.from(rows.values()).filter((row) => row.status === 'PRESENT').length;
      return {
        session,
        presentCount: sessionPresentCount,
        totalMembers,
        attendancePercentage:
          totalMembers > 0 ? Number(((sessionPresentCount / totalMembers) * 100).toFixed(2)) : 0,
      };
    });

    return {
      teamId: claim.id,
      teamName: claim.teamName || `Team-${claim.id}`,
      submissionStatus: claim.status,
      stage: mapClaimStatusToStage(claim.status),
      updatedAt: claim.updatedAt.toISOString(),
      problemId: claim.problem.id,
      problemTitle: claim.problem.title,
      eventId: claim.problem.event?.id ?? null,
      eventTitle: claim.problem.event?.title ?? 'N/A',
      session: effectiveSession,
      totalSessions,
      ticket: teamTicket
        ? {
            id: teamTicket.id,
            ticketId: teamTicket.ticketId,
            status: teamTicket.status,
          }
        : null,
      attendance: {
        presentCount,
        totalMembers,
        attendancePercentage,
      },
      perSessionSummary,
      members,
    };
  });
};

// GET /api/innovation/admin/analytics/attendance
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { filters, errors } = parseInnovationAnalyticsFilters(req.nextUrl.searchParams, {
      defaultPageSize: 10,
      maxPageSize: 50,
    });

    if (errors.length > 0) {
      return errorRes('Validation failed', errors, 400);
    }

    const targetSession = filters.session ?? 1;

    const claimWhere = buildInnovationAnalyticsClaimWhere({
      ...filters,
      session: undefined,
    });

    let scopedClaimWhere: Prisma.ClaimWhereInput = claimWhere;

    if (filters.search) {
      const searchWhere: Prisma.ClaimWhereInput = {
        OR: [
          { teamName: { contains: filters.search } },
          { members: { some: { user: { name: { contains: filters.search } } } } },
          { members: { some: { user: { email: { contains: filters.search } } } } },
          { members: { some: { user: { uid: { contains: filters.search } } } } },
        ],
      };

      scopedClaimWhere = {
        AND: [claimWhere, searchWhere],
      };
    }

    if (typeof filters.eventId === 'number') {
      const selectedEvent = await prisma.hackathonEvent.findUnique({
        where: { id: filters.eventId },
        select: { id: true, totalSessions: true },
      });

      if (!selectedEvent) {
        return errorRes('Event not found', [], 404);
      }

      if (targetSession > selectedEvent.totalSessions) {
        return errorRes('Invalid session', [`session must be between 1 and ${selectedEvent.totalSessions}.`], 400);
      }
    }

    const { page, pageSize, skip, take } = getPagination(filters);

    const [totalTeams, claims] = await prisma.$transaction([
      prisma.claim.count({ where: scopedClaimWhere }),
      prisma.claim.findMany({
        where: scopedClaimWhere,
        skip,
        take,
        orderBy: [{ updatedAt: 'desc' }],
        select: {
          id: true,
          teamName: true,
          status: true,
          updatedAt: true,
          problem: {
            select: {
              id: true,
              title: true,
              event: {
                select: {
                  id: true,
                  title: true,
                  totalSessions: true,
                },
              },
            },
          },
          members: {
            select: {
              id: true,
              role: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  uid: true,
                },
              },
            },
          },
          tickets: {
            where: { type: 'HACKATHON_SELECTION' },
            select: {
              id: true,
              ticketId: true,
              status: true,
              attendanceRecords: {
                select: {
                  claimMemberId: true,
                  session: true,
                  status: true,
                  checkedInAt: true,
                  checkedInBy: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const items = buildAttendanceTeamRows(claims, targetSession);

    const totalPresent = items.reduce((sum, item) => sum + item.attendance.presentCount, 0);
    const totalMembers = items.reduce((sum, item) => sum + item.attendance.totalMembers, 0);

    return successRes(
      {
        items,
        total: totalTeams,
        page,
        pageSize,
        selectedSession: targetSession,
        summary: {
          totalPresent,
          totalMembers,
          attendancePercentage: totalMembers > 0 ? Number(((totalPresent / totalMembers) * 100).toFixed(2)) : 0,
        },
      },
      'Attendance analytics retrieved successfully.'
    );
  } catch (err) {
    console.error('Innovation attendance analytics GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// PATCH /api/innovation/admin/analytics/attendance
export async function PATCH(req: NextRequest) {
  const user = authenticate(req);
  if (!user) return errorRes('Unauthorized', [], 401);
  if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

  return errorRes(
    'Deprecated endpoint',
    ['Use POST /api/attendance with claimId, userId, session, and status.'],
    410
  );
}
