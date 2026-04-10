import { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import {
  buildInnovationAnalyticsClaimWhere,
  computeWeightedAverageScore,
  deriveClaimScore,
  getPagination,
  mapClaimStatusToStage,
  parseInnovationAnalyticsFilters,
} from '@/lib/innovation-analytics';

// GET /api/innovation/admin/analytics/teams
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { filters, errors } = parseInnovationAnalyticsFilters(req.nextUrl.searchParams, {
      defaultPageSize: 20,
      maxPageSize: 100,
    });

    if (errors.length > 0) {
      return errorRes('Validation failed', errors, 400);
    }

    const targetSession = filters.session ?? 1;

    const claimWhere = buildInnovationAnalyticsClaimWhere(filters);
    let scopedClaimWhere: Prisma.ClaimWhereInput = claimWhere;

    if (filters.search) {
      const maybeTeamId = Number(filters.search);
      const searchOr: Prisma.ClaimWhereInput[] = [
        { teamName: { contains: filters.search } },
      ];

      if (Number.isInteger(maybeTeamId) && maybeTeamId > 0) {
        searchOr.push({ id: maybeTeamId });
      }

      scopedClaimWhere = {
        AND: [claimWhere, { OR: searchOr }],
      };
    }

    const { page, pageSize, skip, take } = getPagination(filters);

    const [
      totalTeams,
      shortlistedTeamsCount,
      acceptedTeamsCount,
      rejectedTeamsCount,
      scoredRows,
      pagedTeams,
      groupsByProblem,
      leaderboardRows,
    ] = await prisma.$transaction([
      prisma.claim.count({ where: scopedClaimWhere }),
      prisma.claim.count({ where: { ...scopedClaimWhere, status: 'SHORTLISTED' } }),
      prisma.claim.count({ where: { ...scopedClaimWhere, status: 'ACCEPTED' } }),
      prisma.claim.count({ where: { ...scopedClaimWhere, status: 'REJECTED' } }),
      prisma.claim.findMany({
        where: {
          ...scopedClaimWhere,
          OR: [{ finalScore: { not: null } }, { score: { not: null } }],
        },
        select: {
          finalScore: true,
          score: true,
        },
      }),
      prisma.claim.findMany({
        where: scopedClaimWhere,
        skip,
        take,
        orderBy: [{ updatedAt: 'desc' }],
        select: {
          id: true,
          teamName: true,
          status: true,
          finalScore: true,
          score: true,
          updatedAt: true,
          members: {
            select: {
              id: true,
              role: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  uid: true,
                  phone: true,
                },
              },
            },
            orderBy: [{ role: 'asc' }, { id: 'asc' }],
          },
          _count: {
            select: {
              members: true,
            },
          },
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
          tickets: {
            where: {
              type: 'HACKATHON_SELECTION',
            },
            select: {
              id: true,
              ticketId: true,
              status: true,
              attendanceRecords: {
                select: {
                  session: true,
                  status: true,
                },
              },
            },
          },
        },
      }),
      prisma.claim.groupBy({
        by: ['problemId'],
        where: scopedClaimWhere,
        orderBy: [{ problemId: 'asc' }],
        _count: {
          problemId: true,
        },
      }),
      prisma.claim.findMany({
        where: {
          ...scopedClaimWhere,
          OR: [{ finalScore: { not: null } }, { score: { not: null } }],
        },
        orderBy: [{ finalScore: 'desc' }, { score: 'desc' }, { updatedAt: 'asc' }],
        take: 10,
        select: {
          id: true,
          teamName: true,
          status: true,
          finalScore: true,
          score: true,
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
        },
      }),
    ]);

    const problemIds = groupsByProblem.map((row) => row.problemId);
    const problems =
      problemIds.length > 0
        ? await prisma.problem.findMany({
            where: { id: { in: problemIds } },
            select: {
              id: true,
              title: true,
              eventId: true,
            },
          })
        : [];

    const problemMap = new Map(problems.map((row) => [row.id, row]));

    const teamsPerProblem = groupsByProblem.map((group) => {
      const count =
        typeof group._count === 'object' &&
        group._count !== null &&
        'problemId' in group._count &&
        typeof group._count.problemId === 'number'
          ? group._count.problemId
          : 0;

      return {
        problemId: group.problemId,
        problemTitle: problemMap.get(group.problemId)?.title || `Problem-${group.problemId}`,
        count,
        eventId: problemMap.get(group.problemId)?.eventId ?? null,
      };
    });

    const items = pagedTeams.map((team) => {
      const ticket = team.tickets[0] || null;
      const totalMembers = team._count.members;
      const totalSessions = team.problem.event?.totalSessions ?? 1;
      const effectiveSession = Math.min(targetSession, totalSessions);

      const perSessionSummary = Array.from({ length: totalSessions }, (_, index) => {
        const session = index + 1;
        const sessionPresentCount = ticket
          ? ticket.attendanceRecords.filter((entry) => entry.session === session && entry.status === 'PRESENT').length
          : 0;

        return {
          session,
          presentCount: sessionPresentCount,
          totalMembers,
          attendancePercentage:
            totalMembers > 0 ? Number(((sessionPresentCount / totalMembers) * 100).toFixed(2)) : 0,
        };
      });

      const selectedSessionSummary = perSessionSummary.find((row) => row.session === effectiveSession) || {
        session: effectiveSession,
        presentCount: 0,
        totalMembers,
        attendancePercentage: 0,
      };

      const presentCount = selectedSessionSummary.presentCount;
      const attendancePercentage = totalMembers > 0 ? Math.round((presentCount / totalMembers) * 100) : 0;

      return {
        teamId: team.id,
        teamName: team.teamName || `Team-${team.id}`,
        status: team.status,
        stage: mapClaimStatusToStage(team.status),
        finalScore: deriveClaimScore({ finalScore: team.finalScore, score: team.score }),
        updatedAt: team.updatedAt.toISOString(),
        problemId: team.problem.id,
        problemTitle: team.problem.title,
        eventId: team.problem.event?.id ?? null,
        eventTitle: team.problem.event?.title ?? 'N/A',
        session: effectiveSession,
        totalSessions,
        memberCount: totalMembers,
        members: team.members.map((member) => ({
          claimMemberId: member.id,
          userId: member.user.id,
          name: member.user.name,
          email: member.user.email,
          uid: member.user.uid,
          phone: member.user.phone,
          role: member.role,
        })),
        attendance: {
          presentCount,
          totalMembers,
          attendancePercentage,
        },
        perSessionSummary,
        ticket: ticket
          ? {
              id: ticket.id,
              ticketId: ticket.ticketId,
              status: ticket.status,
            }
          : null,
      };
    });

    const leaderboard = leaderboardRows.map((row, index) => ({
      rank: index + 1,
      teamId: row.id,
      teamName: row.teamName || `Team-${row.id}`,
      score: deriveClaimScore({ finalScore: row.finalScore, score: row.score }) || 0,
      status: row.status,
      problemTitle: row.problem.title,
      eventTitle: row.problem.event?.title || 'N/A',
    }));

    return successRes(
      {
        summary: {
          totalTeamsRegistered: totalTeams,
          shortlistedTeamsCount,
          acceptedTeamsCount,
          rejectedTeamsCount,
          averageTeamScore: computeWeightedAverageScore(scoredRows),
        },
        acceptedVsRejected: {
          accepted: acceptedTeamsCount,
          rejected: rejectedTeamsCount,
        },
        teamsPerProblem,
        leaderboard,
        teams: {
          items,
          total: totalTeams,
          page,
          pageSize,
        },
        selectedSession: targetSession,
      },
      'Team analytics retrieved successfully.'
    );
  } catch (err) {
    console.error('Innovation team analytics GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
