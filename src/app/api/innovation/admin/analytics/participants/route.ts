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

// GET /api/innovation/admin/analytics/participants
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { filters, errors } = parseInnovationAnalyticsFilters(req.nextUrl.searchParams, {
      defaultPageSize: 25,
      maxPageSize: 100,
    });

    if (errors.length > 0) {
      return errorRes('Validation failed', errors, 400);
    }

    const claimWhere = buildInnovationAnalyticsClaimWhere(filters);
    const { page, pageSize, skip, take } = getPagination(filters);

    const participantWhere: Prisma.ClaimMemberWhereInput = {
      claim: claimWhere,
    };

    if (filters.search) {
      participantWhere.OR = [
        {
          user: {
            name: { contains: filters.search },
          },
        },
        {
          user: {
            email: { contains: filters.search },
          },
        },
        {
          user: {
            uid: { contains: filters.search },
          },
        },
        {
          claim: {
            teamName: { contains: filters.search },
          },
        },
      ];
    }

    const optionClaimWhere = buildInnovationAnalyticsClaimWhere({
      ...filters,
      teamId: undefined,
      team: undefined,
      status: undefined,
      stage: undefined,
      search: undefined,
      startDate: undefined,
      endDate: undefined,
    });

    const [total, participantRows, events, problems, teams, totalTeams, scoredRows] = await prisma.$transaction([
      prisma.claimMember.count({ where: participantWhere }),
      prisma.claimMember.findMany({
        where: participantWhere,
        skip,
        take,
        orderBy: [{ claimId: 'desc' }, { id: 'asc' }],
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
          claim: {
            select: {
              id: true,
              teamName: true,
              status: true,
              updatedAt: true,
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
          },
        },
      }),
      prisma.hackathonEvent.findMany({
        orderBy: [{ startTime: 'desc' }],
        select: { id: true, title: true, status: true, totalSessions: true },
      }),
      prisma.problem.findMany({
        where: {
          eventId: filters.eventId ?? { not: null },
        },
        orderBy: [{ createdAt: 'desc' }],
        select: {
          id: true,
          title: true,
          eventId: true,
        },
      }),
      prisma.claim.findMany({
        where: optionClaimWhere,
        orderBy: [{ updatedAt: 'desc' }],
        take: 500,
        select: {
          id: true,
          teamName: true,
          problemId: true,
          problem: {
            select: {
              eventId: true,
            },
          },
        },
      }),
      prisma.claim.count({ where: claimWhere }),
      prisma.claim.findMany({
        where: {
          ...claimWhere,
          OR: [{ finalScore: { not: null } }, { score: { not: null } }],
        },
        select: {
          finalScore: true,
          score: true,
        },
      }),
    ]);

    const items = participantRows.map((row) => {
      const teamName = row.claim.teamName || `Team-${row.claim.id}`;
      const score = deriveClaimScore({ finalScore: row.claim.finalScore, score: row.claim.score });

      return {
        id: row.id,
        teamId: row.claim.id,
        teamName,
        teamIdentifier: `${row.claim.id}/${row.user.uid || 'N/A'}`,
        memberName: row.user.name,
        role: row.role === 'LEAD' ? 'Leader' : 'Member',
        email: row.user.email,
        phone: row.user.phone,
        uid: row.user.uid,
        problemId: row.claim.problem.id,
        problemStatement: row.claim.problem.title,
        eventId: row.claim.problem.event?.id ?? null,
        eventName: row.claim.problem.event?.title ?? 'N/A',
        submissionStatus: row.claim.status,
        stage: mapClaimStatusToStage(row.claim.status),
        finalScore: score,
        updatedAt: row.claim.updatedAt.toISOString(),
      };
    });

    return successRes(
      {
        items,
        total,
        page,
        pageSize,
        summary: {
          totalParticipants: total,
          totalTeams,
          averageScore: computeWeightedAverageScore(scoredRows),
        },
        options: {
          events,
          problems,
          teams: teams.map((team) => ({
            id: team.id,
            name: team.teamName || `Team-${team.id}`,
            problemId: team.problemId,
            eventId: team.problem.eventId,
          })),
        },
      },
      'Participant analytics retrieved successfully.'
    );
  } catch (err) {
    console.error('Innovation participant analytics GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
