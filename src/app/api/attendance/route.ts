import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { syncHackathonTicketUsageStatus } from '@/lib/tickets';
import { deriveErpUid, bumpAttendanceStat } from '@/lib/erp-attendance';

// GET /api/attendance — ERP attendance snapshot for the session user.
// uid is derived server-side from the session email; never from client input.
export async function GET(req: NextRequest) {
  try {
    if (process.env.ATTENDANCE_ENABLED === 'false') {
      return errorRes('Attendance sync is disabled', [], 403);
    }
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const uid = deriveErpUid(user.email);
    if (!uid) return successRes({ eligible: false, uid: null });

    const [rows, lastSynced, job, userRow] = await Promise.all([
      prisma.attendanceSnapshot.findMany({ where: { uid }, orderBy: { id: 'asc' } }),
      prisma.attendanceSnapshot.findFirst({ where: { uid }, orderBy: { fetchedAt: 'desc' } }),
      prisma.attendanceSyncJob.findFirst({
        where: { uid },
        orderBy: { id: 'desc' },
        select: { id: true, status: true, attempts: true, lastError: true, createdAt: true },
      }),
      prisma.user.findFirst({ where: { id: user.id }, select: { erpPasswordEnc: true } }),
    ]);
    const pause = await prisma.attendanceStat.findUnique({ where: { key: 'erp_paused_until' } });
    const erpPaused = !!pause && pause.value * 1000 > Date.now();
    const pausedAtRow = await prisma.attendanceStat.findUnique({ where: { key: 'erp_paused_at' } });
    const erpPausedAt = pausedAtRow ? pausedAtRow.value * 1000 : null;
    void bumpAttendanceStat(prisma, 'views');
    return successRes({
      eligible: true,
      uid,
      hasPassword: !!userRow?.erpPasswordEnc,
      erpPaused,
      erpPausedAt,
      rows: rows.map((r) => ({
        subject: r.subject,
        type: r.type,
        present: r.present,
        total: r.total,
        percentage: r.percentage,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
      })),
      lastSyncedAt: lastSynced?.fetchedAt ?? null,
      job,
    });
  } catch (err) {
    console.error('Attendance GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

const attendanceMarkSchema = z.object({
  claimId: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
  session: z.coerce.number().int().positive(),
  status: z.enum(['PRESENT', 'NOT_PRESENT']),
});

// POST /api/attendance
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN', 'FACULTY')) {
      return errorRes('Forbidden', ['Admin or faculty access required'], 403);
    }

    const body = await req.json();
    const parsed = attendanceMarkSchema.safeParse(body);
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
            userId: true,
          },
        },
        problem: {
          select: {
            event: {
              select: {
                id: true,
                totalSessions: true,
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
          },
        },
      },
    });

    if (!claim) {
      return errorRes('Claim not found', [], 404);
    }

    const event = claim.problem.event;
    if (!event) {
      return errorRes('Attendance unavailable', ['Claim is not linked to a hackathon event.'], 400);
    }

    if (parsed.data.session > event.totalSessions) {
      return errorRes(
        'Invalid session',
        [`session must be between 1 and ${event.totalSessions} for this event.`],
        400
      );
    }

    const ticket = claim.tickets[0] || null;
    if (!ticket) {
      return errorRes('Attendance unavailable', ['No team ticket found for this claim.'], 400);
    }

    const member = claim.members.find((row) => row.userId === parsed.data.userId) || null;
    if (!member) {
      return errorRes('Invalid member', ['User is not a member of the provided claim.'], 400);
    }

    const existing = await prisma.ticketAttendance.findUnique({
      where: {
        userId_claimId_session: {
          userId: parsed.data.userId,
          claimId: claim.id,
          session: parsed.data.session,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (existing && existing.status === parsed.data.status) {
      return errorRes('Duplicate attendance mark', ['Attendance already marked for this member and session.'], 409);
    }

    const now = new Date();

    await prisma.ticketAttendance.upsert({
      where: {
        userId_claimId_session: {
          userId: parsed.data.userId,
          claimId: claim.id,
          session: parsed.data.session,
        },
      },
      update: {
        ticketId: ticket.id,
        claimMemberId: member.id,
        status: parsed.data.status,
        checkedInAt: parsed.data.status === 'PRESENT' ? now : null,
        checkedInByUserId: parsed.data.status === 'PRESENT' ? user.id : null,
      },
      create: {
        ticketId: ticket.id,
        claimId: claim.id,
        userId: parsed.data.userId,
        claimMemberId: member.id,
        session: parsed.data.session,
        status: parsed.data.status,
        checkedInAt: parsed.data.status === 'PRESENT' ? now : null,
        checkedInByUserId: parsed.data.status === 'PRESENT' ? user.id : null,
      },
    });

    await prisma.ticketAttendance.createMany({
      data: claim.members.map((row) => ({
        ticketId: ticket.id,
        claimId: claim.id,
        userId: row.userId,
        claimMemberId: row.id,
        session: parsed.data.session,
        status: 'NOT_PRESENT' as const,
      })),
      skipDuplicates: true,
    });

    const sessionRows = await prisma.ticketAttendance.findMany({
      where: {
        ticketId: ticket.id,
        session: parsed.data.session,
      },
      select: {
        status: true,
      },
    });

    const presentCount = sessionRows.filter((row) => row.status === 'PRESENT').length;
    const totalMembers = claim.members.length;

    const ticketSync = await syncHackathonTicketUsageStatus(ticket.id, totalMembers, event.totalSessions);

    return successRes(
      {
        claimId: claim.id,
        userId: parsed.data.userId,
        session: parsed.data.session,
        totalSessions: event.totalSessions,
        ticketId: ticket.ticketId,
        ticketStatus: ticketSync.status,
        summary: {
          presentCount,
          totalMembers,
          attendancePercentage: totalMembers > 0 ? Number(((presentCount / totalMembers) * 100).toFixed(2)) : 0,
        },
      },
      'Attendance updated successfully.'
    );
  } catch (err) {
    console.error('Attendance POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
