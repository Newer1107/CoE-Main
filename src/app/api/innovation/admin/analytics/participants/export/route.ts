import { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes } from '@/lib/api-helpers';
import {
  buildInnovationAnalyticsClaimWhere,
  deriveClaimScore,
  mapClaimStatusToStage,
  parseInnovationAnalyticsFilters,
} from '@/lib/innovation-analytics';

const csvEscape = (value: unknown): string => {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

// GET /api/innovation/admin/analytics/participants/export
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { filters, errors } = parseInnovationAnalyticsFilters(req.nextUrl.searchParams, {
      defaultPageSize: 1000,
      maxPageSize: 50000,
    });

    if (errors.length > 0) {
      return errorRes('Validation failed', errors, 400);
    }

    const claimWhere = buildInnovationAnalyticsClaimWhere(filters);

    const participantWhere: Prisma.ClaimMemberWhereInput = {
      claim: claimWhere,
    };

    if (filters.search) {
      participantWhere.OR = [
        { user: { name: { contains: filters.search } } },
        { user: { email: { contains: filters.search } } },
        { user: { uid: { contains: filters.search } } },
        { claim: { teamName: { contains: filters.search } } },
      ];
    }

    const rows = await prisma.claimMember.findMany({
      where: participantWhere,
      orderBy: [{ claimId: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        role: true,
        user: {
          select: {
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
                event: { select: { id: true, title: true } },
              },
            },
          },
        },
      },
    });

    const headers = [
      'Team Name',
      'Team ID / UID',
      'Member Name',
      'Role',
      'Email',
      'Phone Number',
      'Problem Statement',
      'Hackathon Event Name',
      'Submission Status',
      'Stage',
      'Final Score',
      'Updated At',
    ];

    const lines = rows.map((row) => {
      const finalScore = deriveClaimScore({ finalScore: row.claim.finalScore, score: row.claim.score });
      return [
        row.claim.teamName || `Team-${row.claim.id}`,
        `${row.claim.id}/${row.user.uid || 'N/A'}`,
        row.user.name,
        row.role === 'LEAD' ? 'Leader' : 'Member',
        row.user.email,
        row.user.phone || '',
        row.claim.problem.title,
        row.claim.problem.event?.title || 'N/A',
        row.claim.status,
        mapClaimStatusToStage(row.claim.status),
        finalScore ?? '',
        row.claim.updatedAt.toISOString(),
      ]
        .map(csvEscape)
        .join(',');
    });

    const csv = [headers.map(csvEscape).join(','), ...lines].join('\n');

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="hackathon-participants-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Innovation participant analytics CSV export error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
