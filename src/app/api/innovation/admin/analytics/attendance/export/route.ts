import { ClaimStatus, MemberAttendanceStatus, Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes } from '@/lib/api-helpers';
import { getSignedUrl } from '@/lib/minio';
import {
  buildInnovationAnalyticsClaimWhere,
  mapClaimStatusToStage,
  parseInnovationAnalyticsFilters,
} from '@/lib/innovation-analytics';

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

const csvEscape = (value: unknown): string => {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

// GET /api/innovation/admin/analytics/attendance/export
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

    const claims = await prisma.claim.findMany({
      where: scopedClaimWhere,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        teamName: true,
        status: true,
        submissionFileKey: true,
        updatedAt: true,
        problem: {
          select: {
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
        sessionDocuments: {
          select: {
            session: true,
            documentKey: true,
          },
        },
        tickets: {
          where: { type: 'HACKATHON_SELECTION' },
          select: {
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
    });

    const maxSessions = claims.reduce((max, claim) => {
      const totalSessions = claim.problem.event?.totalSessions ?? 1;
      return Math.max(max, totalSessions);
    }, 1);

    const headers = [
      'Team ID',
      'Team Name',
      'Team Ticket ID',
      'Ticket Status',
      'Event ID',
      'Hackathon Event Name',
      'Problem Statement',
      'Submission Status',
      'Stage',
      'Total Sessions',
      'Draft Document Uploaded',
      'Draft Document Link',
      'Member Name',
      'Member Email',
      'Member Phone',
      'Member UID',
      'Member Role',
      'Claim Member ID',
      'User ID',
    ];

    for (let session = 1; session <= maxSessions; session += 1) {
      headers.push(`Session ${session} Status`);
      headers.push(`Session ${session} Marked Time`);
      headers.push(`Session ${session} Marked By`);
    }

    for (let session = 1; session <= maxSessions; session += 1) {
      headers.push(`Session ${session} Document Uploaded`);
      headers.push(`Session ${session} Document Link`);
    }

    headers.push('Sessions Present Count');
    headers.push('Documents Uploaded Count');
    headers.push('Documents Required Count');
    headers.push('Updated At');

    const lines: string[] = [];

    for (const claim of claims) {
      const totalSessions = claim.problem.event?.totalSessions ?? 1;
      const teamTicket = claim.tickets[0] || null;
      const sessionDocumentBySession = new Map<number, string>();

      await Promise.all(
        claim.sessionDocuments.map(async (doc) => {
          const documentUrl = await getSignedUrl(doc.documentKey).catch(() => '');
          sessionDocumentBySession.set(doc.session, documentUrl);
        })
      );

      const draftDocumentUrl = claim.submissionFileKey
        ? await getSignedUrl(claim.submissionFileKey).catch(() => '')
        : '';
      const documentsUploadedCount = (draftDocumentUrl ? 1 : 0) + claim.sessionDocuments.length;
      const documentsRequiredCount = 1 + totalSessions;

      const attendanceBySession = new Map<number, Map<number, AttendanceRow>>();
      for (const row of teamTicket?.attendanceRecords || []) {
        if (!attendanceBySession.has(row.session)) {
          attendanceBySession.set(row.session, new Map<number, AttendanceRow>());
        }
        attendanceBySession.get(row.session)?.set(row.claimMemberId, row);
      }

      for (const member of claim.members) {
        const rowValues: Array<string | number> = [
          claim.id,
          claim.teamName || `Team-${claim.id}`,
          teamTicket?.ticketId || '',
          teamTicket?.status || '',
          claim.problem.event?.id ?? '',
          claim.problem.event?.title || 'N/A',
          claim.problem.title,
          claim.status,
          mapClaimStatusToStage(claim.status as ClaimStatus),
          totalSessions,
          draftDocumentUrl ? 'YES' : 'NO',
          draftDocumentUrl,
          member.user.name,
          member.user.email,
          member.user.phone || '',
          member.user.uid || '',
          member.role === 'LEAD' ? 'Leader' : 'Member',
          member.id,
          member.user.id,
        ];

        let presentSessionCount = 0;

        for (let session = 1; session <= maxSessions; session += 1) {
          const attendance = attendanceBySession.get(session)?.get(member.id);
          const isOutsideEventSessions = session > totalSessions;

          if (isOutsideEventSessions) {
            rowValues.push('N/A', '', '');
            continue;
          }

          const status = attendance?.status || 'NOT_PRESENT';
          if (status === 'PRESENT') presentSessionCount += 1;

          rowValues.push(
            status,
            attendance?.checkedInAt ? attendance.checkedInAt.toISOString() : '',
            attendance?.checkedInBy?.name || ''
          );
        }

        for (let session = 1; session <= maxSessions; session += 1) {
          const isOutsideEventSessions = session > totalSessions;

          if (isOutsideEventSessions) {
            rowValues.push('N/A', '');
            continue;
          }

          const sessionDocumentUrl = sessionDocumentBySession.get(session) || '';
          rowValues.push(sessionDocumentUrl ? 'YES' : 'NO', sessionDocumentUrl);
        }

        rowValues.push(presentSessionCount);
        rowValues.push(documentsUploadedCount);
        rowValues.push(documentsRequiredCount);
        rowValues.push(claim.updatedAt.toISOString());

        lines.push(rowValues.map(csvEscape).join(','));
      }
    }

    const csv = [headers.map(csvEscape).join(','), ...lines].join('\n');

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="hackathon-attendance-individual-sessions-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Innovation attendance analytics CSV export error:', err);
    return errorRes('Internal server error', [], 500);
  }
}