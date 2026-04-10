import { ClaimStatus, MemberAttendanceStatus, Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import {
  buildInnovationAnalyticsClaimWhere,
  getPagination,
  mapClaimStatusToStage,
  parseInnovationAnalyticsFilters,
} from '@/lib/innovation-analytics';

const markAttendanceSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('MARK_MEMBER'),
    claimId: z.coerce.number().int().positive(),
    claimMemberIds: z.array(z.coerce.number().int().positive()).min(1),
    status: z.enum(['PRESENT', 'NOT_PRESENT']),
  }),
  z.object({
    action: z.literal('MARK_TEAM'),
    claimId: z.coerce.number().int().positive(),
    status: z.enum(['PRESENT', 'NOT_PRESENT']),
  }),
]);

const buildAttendanceTeamRows = (claims: Array<{
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
    attendanceRecords: Array<{
      claimMemberId: number;
      status: MemberAttendanceStatus;
      checkedInAt: Date | null;
      checkedInBy: {
        id: number;
        name: string;
        email: string;
      } | null;
    }>;
  }>;
}>) => {
  return claims.map((claim) => {
    const teamTicket = claim.tickets[0] || null;
    const attendanceMap = new Map(teamTicket?.attendanceRecords.map((row) => [row.claimMemberId, row]) || []);

    const members = claim.members.map((member) => {
      const attendance = attendanceMap.get(member.id);
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

    const claimWhere = buildInnovationAnalyticsClaimWhere(filters);
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

    const items = buildAttendanceTeamRows(claims);

    const totalPresent = items.reduce((sum, item) => sum + item.attendance.presentCount, 0);
    const totalMembers = items.reduce((sum, item) => sum + item.attendance.totalMembers, 0);

    return successRes(
      {
        items,
        total: totalTeams,
        page,
        pageSize,
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
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const body = await req.json();
    const parsed = markAttendanceSchema.safeParse(body);
    if (!parsed.success) {
      return errorRes(
        'Validation failed',
        parsed.error.issues.map((issue) => issue.message),
        400
      );
    }

    const claim = await prisma.claim.findUnique({
      where: { id: parsed.data.claimId },
      select: {
        id: true,
        members: {
          select: {
            id: true,
          },
        },
        tickets: {
          where: { type: 'HACKATHON_SELECTION' },
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!claim) {
      return errorRes('Claim not found', [], 404);
    }

    const ticket = claim.tickets[0] || null;
    if (!ticket) {
      return errorRes('Attendance unavailable', ['No team ticket found for this claim.'], 400);
    }

    const memberIds = new Set(claim.members.map((member) => member.id));

    const selectedClaimMemberIds =
      parsed.data.action === 'MARK_TEAM'
        ? Array.from(memberIds)
        : Array.from(new Set(parsed.data.claimMemberIds.filter((id) => memberIds.has(id))));

    if (selectedClaimMemberIds.length === 0) {
      return errorRes('Invalid members', ['No valid claim members selected for attendance update.'], 400);
    }

    const now = new Date();
    const nextStatus = parsed.data.status;

    await prisma.$transaction(async (tx) => {
      await Promise.all(
        selectedClaimMemberIds.map((claimMemberId) =>
          tx.ticketAttendance.upsert({
            where: {
              ticketId_claimMemberId: {
                ticketId: ticket.id,
                claimMemberId,
              },
            },
            update: {
              status: nextStatus,
              checkedInAt: nextStatus === 'PRESENT' ? now : null,
              checkedInByUserId: nextStatus === 'PRESENT' ? user.id : null,
            },
            create: {
              ticketId: ticket.id,
              claimMemberId,
              status: nextStatus,
              checkedInAt: nextStatus === 'PRESENT' ? now : null,
              checkedInByUserId: nextStatus === 'PRESENT' ? user.id : null,
            },
          })
        )
      );

      const attendanceRows = await tx.ticketAttendance.findMany({
        where: { ticketId: ticket.id },
        select: { status: true },
      });

      const presentCount = attendanceRows.filter((row) => row.status === 'PRESENT').length;
      const totalMembers = claim.members.length;

      if (totalMembers > 0 && presentCount === totalMembers && ticket.status !== 'CANCELLED') {
        await tx.ticket.update({
          where: { id: ticket.id },
          data: {
            status: 'USED',
            usedAt: now,
          },
        });
      } else if (ticket.status === 'USED' && presentCount < totalMembers) {
        await tx.ticket.update({
          where: { id: ticket.id },
          data: {
            status: 'ACTIVE',
            usedAt: null,
          },
        });
      }
    });

    return successRes(
      {
        claimId: claim.id,
        ticketId: ticket.id,
        updatedMembers: selectedClaimMemberIds.length,
      },
      parsed.data.action === 'MARK_TEAM' ? 'Team attendance updated.' : 'Member attendance updated.'
    );
  } catch (err) {
    console.error('Innovation attendance analytics PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
