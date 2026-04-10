import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import {
  buildInnovationAnalyticsClaimWhere,
  deriveClaimScore,
  parseInnovationAnalyticsFilters,
} from '@/lib/innovation-analytics';

const toDayKey = (date: Date) => date.toISOString().slice(0, 10);

const computePearsonCorrelation = (pairs: Array<{ x: number; y: number }>) => {
  if (pairs.length < 2) return null;

  const n = pairs.length;
  const sumX = pairs.reduce((sum, pair) => sum + pair.x, 0);
  const sumY = pairs.reduce((sum, pair) => sum + pair.y, 0);
  const sumXY = pairs.reduce((sum, pair) => sum + pair.x * pair.y, 0);
  const sumX2 = pairs.reduce((sum, pair) => sum + pair.x * pair.x, 0);
  const sumY2 = pairs.reduce((sum, pair) => sum + pair.y * pair.y, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (denominator === 0) return null;
  return Number((numerator / denominator).toFixed(4));
};

const scoreBinLabel = (score: number) => {
  if (score < 20) return '0-19';
  if (score < 40) return '20-39';
  if (score < 60) return '40-59';
  if (score < 80) return '60-79';
  return '80-100';
};

// GET /api/innovation/admin/analytics/insights
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

    const claimWhere = buildInnovationAnalyticsClaimWhere(filters);

    const [
      allClaims,
      groupedByProblem,
      dropOffRegistered,
      dropOffSubmitted,
      dropOffShortlisted,
      dropOffAccepted,
      scoredClaims,
      scoredRubrics,
      attendanceScoreClaims,
    ] = await prisma.$transaction([
      prisma.claim.findMany({
        where: claimWhere,
        select: {
          id: true,
          createdAt: true,
          status: true,
          problemId: true,
          teamName: true,
        },
      }),
      prisma.claim.groupBy({
        by: ['problemId'],
        where: claimWhere,
        orderBy: [{ problemId: 'asc' }],
        _count: {
          problemId: true,
        },
      }),
      prisma.claim.count({ where: claimWhere }),
      prisma.claim.count({
        where: {
          ...claimWhere,
          status: {
            in: ['SUBMITTED', 'REVISION_REQUESTED', 'SHORTLISTED', 'ACCEPTED', 'REJECTED'],
          },
        },
      }),
      prisma.claim.count({
        where: {
          ...claimWhere,
          status: {
            in: ['SHORTLISTED', 'ACCEPTED', 'REJECTED'],
          },
        },
      }),
      prisma.claim.count({
        where: {
          ...claimWhere,
          status: 'ACCEPTED',
        },
      }),
      prisma.claim.findMany({
        where: {
          ...claimWhere,
          OR: [{ finalScore: { not: null } }, { score: { not: null } }],
        },
        select: {
          problemId: true,
          finalScore: true,
          score: true,
        },
      }),
      prisma.claim.findMany({
        where: {
          ...claimWhere,
          OR: [
            { innovationScore: { not: null } },
            { technicalScore: { not: null } },
            { impactScore: { not: null } },
            { uxScore: { not: null } },
            { executionScore: { not: null } },
            { presentationScore: { not: null } },
            { feasibilityScore: { not: null } },
          ],
        },
        select: {
          innovationScore: true,
          technicalScore: true,
          impactScore: true,
          uxScore: true,
          executionScore: true,
          presentationScore: true,
          feasibilityScore: true,
          finalScore: true,
          score: true,
        },
      }),
      prisma.claim.findMany({
        where: {
          ...claimWhere,
          OR: [{ finalScore: { not: null } }, { score: { not: null } }],
          tickets: {
            some: {
              type: 'HACKATHON_SELECTION',
            },
          },
        },
        select: {
          id: true,
          finalScore: true,
          score: true,
          _count: {
            select: {
              members: true,
            },
          },
          tickets: {
            where: {
              type: 'HACKATHON_SELECTION',
            },
            select: {
              attendanceRecords: {
                select: {
                  status: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const problemIds = Array.from(new Set(groupedByProblem.map((item) => item.problemId)));
    const problems =
      problemIds.length > 0
        ? await prisma.problem.findMany({
            where: { id: { in: problemIds } },
            select: { id: true, title: true },
          })
        : [];

    const problemMap = new Map(problems.map((problem) => [problem.id, problem.title]));

    const trendMap = new Map<string, number>();
    for (const claim of allClaims) {
      const day = toDayKey(claim.createdAt);
      trendMap.set(day, (trendMap.get(day) || 0) + 1);
    }

    const participationTrends = Array.from(trendMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, teams]) => ({ date, teams }));

    const problemPopularity = groupedByProblem
      .map((entry) => {
        const teams =
          typeof entry._count === 'object' &&
          entry._count !== null &&
          'problemId' in entry._count &&
          typeof entry._count.problemId === 'number'
            ? entry._count.problemId
            : 0;

        return {
          problemId: entry.problemId,
          problemTitle: problemMap.get(entry.problemId) || `Problem-${entry.problemId}`,
          teams,
        };
      })
      .sort((a, b) => b.teams - a.teams);

    const dropOffRate = {
      registered: dropOffRegistered,
      submitted: dropOffSubmitted,
      shortlisted: dropOffShortlisted,
      accepted: dropOffAccepted,
      percentages: {
        submittedFromRegistered: dropOffRegistered > 0 ? Number(((dropOffSubmitted / dropOffRegistered) * 100).toFixed(2)) : 0,
        shortlistedFromRegistered: dropOffRegistered > 0 ? Number(((dropOffShortlisted / dropOffRegistered) * 100).toFixed(2)) : 0,
        acceptedFromRegistered: dropOffRegistered > 0 ? Number(((dropOffAccepted / dropOffRegistered) * 100).toFixed(2)) : 0,
      },
    };

    const scoredByProblemMap = new Map<number, number[]>();
    for (const row of scoredClaims) {
      const score = deriveClaimScore({ finalScore: row.finalScore, score: row.score });
      if (typeof score !== 'number') continue;
      if (!scoredByProblemMap.has(row.problemId)) {
        scoredByProblemMap.set(row.problemId, []);
      }
      scoredByProblemMap.get(row.problemId)?.push(score);
    }

    const averageScoresByProblem = Array.from(scoredByProblemMap.entries())
      .map(([problemId, scores]) => ({
        problemId,
        problemTitle: problemMap.get(problemId) || `Problem-${problemId}`,
        averageScore: Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(2)),
        scoredTeams: scores.length,
      }))
      .sort((a, b) => b.averageScore - a.averageScore);

    const scoreBins = new Map<string, number>([
      ['0-19', 0],
      ['20-39', 0],
      ['40-59', 0],
      ['60-79', 0],
      ['80-100', 0],
    ]);

    for (const row of scoredRubrics) {
      const score = deriveClaimScore({ finalScore: row.finalScore, score: row.score });
      if (typeof score !== 'number') continue;
      const bin = scoreBinLabel(score);
      scoreBins.set(bin, (scoreBins.get(bin) || 0) + 1);
    }

    const rubricTotals = {
      innovationScore: { total: 0, count: 0 },
      technicalScore: { total: 0, count: 0 },
      impactScore: { total: 0, count: 0 },
      uxScore: { total: 0, count: 0 },
      executionScore: { total: 0, count: 0 },
      presentationScore: { total: 0, count: 0 },
      feasibilityScore: { total: 0, count: 0 },
    };

    for (const row of scoredRubrics) {
      const rubricEntries = Object.entries(rubricTotals) as Array<
        [
          keyof typeof rubricTotals,
          {
            total: number;
            count: number;
          }
        ]
      >;

      for (const [key, aggregate] of rubricEntries) {
        const value = row[key];
        if (typeof value !== 'number') continue;
        aggregate.total += value;
        aggregate.count += 1;
      }
    }

    const rubricAverages = Object.entries(rubricTotals).map(([key, aggregate]) => ({
      rubric: key.replace('Score', ''),
      average: aggregate.count > 0 ? Number((aggregate.total / aggregate.count).toFixed(2)) : null,
      count: aggregate.count,
    }));

    const correlationPairs: Array<{ x: number; y: number }> = [];
    const attendanceBuckets = {
      low: [] as number[],
      medium: [] as number[],
      high: [] as number[],
    };

    for (const row of attendanceScoreClaims) {
      const score = deriveClaimScore({ finalScore: row.finalScore, score: row.score });
      if (typeof score !== 'number') continue;

      const ticket = row.tickets[0] || null;
      const presentCount = ticket
        ? ticket.attendanceRecords.filter((record) => record.status === 'PRESENT').length
        : 0;
      const totalMembers = row._count.members;
      if (totalMembers <= 0) continue;

      const attendancePercentage = (presentCount / totalMembers) * 100;
      correlationPairs.push({ x: attendancePercentage, y: score });

      if (attendancePercentage < 50) attendanceBuckets.low.push(score);
      else if (attendancePercentage < 80) attendanceBuckets.medium.push(score);
      else attendanceBuckets.high.push(score);
    }

    const average = (values: number[]) => {
      if (values.length === 0) return null;
      return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
    };

    const attendanceVsPerformance = {
      correlation: computePearsonCorrelation(correlationPairs),
      sampleSize: correlationPairs.length,
      bucketAverages: {
        lowAttendance: {
          range: '<50%',
          averageScore: average(attendanceBuckets.low),
          teams: attendanceBuckets.low.length,
        },
        mediumAttendance: {
          range: '50-79%',
          averageScore: average(attendanceBuckets.medium),
          teams: attendanceBuckets.medium.length,
        },
        highAttendance: {
          range: '80-100%',
          averageScore: average(attendanceBuckets.high),
          teams: attendanceBuckets.high.length,
        },
      },
    };

    return successRes(
      {
        participationTrends,
        problemPopularity,
        dropOffRate,
        averageScoresByProblem,
        judgeScoringDistribution: {
          scoreBins: Array.from(scoreBins.entries()).map(([range, teams]) => ({ range, teams })),
          rubricAverages,
        },
        attendanceVsPerformance,
      },
      'Advanced innovation analytics retrieved successfully.'
    );
  } catch (err) {
    console.error('Innovation advanced analytics GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
