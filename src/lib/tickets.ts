import crypto from 'crypto';
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { deleteFile, uploadFileWithObjectKey } from '@/lib/minio';
import { logActivity } from '@/lib/activity-log';
import { sendTicketIssuedEmail } from '@/lib/mailer';
import { bookingDateTimeFromIST } from '@/lib/time';
import fs from 'node:fs';
import path from 'node:path';

type TicketType = 'FACILITY_BOOKING' | 'HACKATHON_SELECTION';

type TicketBuildInput = {
  type: TicketType;
  userId: number;
  userName: string;
  userEmail: string;
  title: string;
  subjectName: string;
  scheduledAt?: Date | null;
  instructionText: string;
  bookingId?: number;
  claimId?: number;
  metadata?: Prisma.InputJsonValue;
  teamMembersForEmail?: Array<{ name: string; email: string; role: string }>;
};

type AttendanceMemberRow = {
  claimMemberId: number;
  userId: number;
  name: string;
  email: string;
  uid: string | null;
  role: string;
  session: number;
  attendanceStatus: 'NOT_PRESENT' | 'PRESENT';
  checkedInAt: string | null;
};

const platformName = 'TCET Centre of Excellence';

const getTicketPrefix = (type: TicketType) => (type === 'FACILITY_BOOKING' ? 'BKG' : 'HKT');

const formatDateTime = (date: Date | null | undefined) => {
  if (!date) return 'N/A';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
};

const buildTicketIdCandidate = (type: TicketType) => {
  const prefix = getTicketPrefix(type);
  const datePart = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const rand = crypto.randomBytes(10).toString('hex').toUpperCase();
  return `${prefix}-${datePart}-${rand}`;
};

const generateUniqueTicketId = async (type: TicketType) => {
  for (let i = 0; i < 8; i += 1) {
    const candidate = buildTicketIdCandidate(type);
    const existing = await prisma.ticket.findUnique({ where: { ticketId: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }

  throw new Error('Unable to generate unique ticket id');
};

const extractBase64 = (dataUrl: string) => {
  const split = dataUrl.split(',');
  return split.length === 2 ? split[1] : '';
};

const FONT_SERIF = path.join(process.cwd(), 'public/fonts/playfair.ttf');
const FONT_SANS = path.join(process.cwd(), 'public/fonts/manrope.ttf');
const LOGO_TCET = path.join(process.cwd(), 'public/tcet-logo.png');
const LOGO_COE = path.join(process.cwd(), 'public/coe-logo-v2.jpeg');

const NAVY = '#002155';
const GOLD = '#fd9923';
const GOLD_DEEP = '#d97706';
const CREAM = '#f5f4f0';
const INK = '#111827';
const GRAY = '#6b7280';
const HAIR = '#b9b4a8';

const fmtTicketDate = (d: Date) => d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Editorial ticket (Concept B): cream paper, Playfair serif hero, contents-style
 * index with dotted leaders, watermarked CoE logo, framed QR. Fully data-driven:
 * the hero splits the subject on ' — ' (main / sub); without a separator the sub
 * falls back to the ticket title. QR generation is identical to the legacy design.
 */
export const buildPdfBuffer = async (payload: {
  ticketId: string;
  ticketTitle: string;
  userName: string;
  subjectName: string;
  scheduledAt?: Date | null;
  instructionText: string;
  qrValue: string;
}) => {
  const qrDataUrl = await QRCode.toDataURL(payload.qrValue, { errorCorrectionLevel: 'M', margin: 1, width: 240 });
  const qrBase64 = extractBase64(qrDataUrl);
  const qrBuffer = Buffer.from(qrBase64, 'base64');

  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width; // 595.28
  const H = doc.page.height; // 841.89

  // cream paper
  doc.rect(0, 0, W, H).fill(CREAM);

  // watermark CoE logo bottom-left
  doc.save();
  doc.opacity(0.07);
  doc.image(LOGO_COE, 50, H - 250, { height: 85 });
  doc.restore();

  // logos top-right
  doc.image(LOGO_TCET, W - 160 - 42, 40, { height: 42 });
  doc.image(LOGO_COE, W - 160, 40, { height: 42 });

  // overline
  doc.font(FONT_SANS).fontSize(8).fillColor(GRAY).text('TCET CENTRE OF EXCELLENCE — DIGITAL PASS', 51, 108, { characterSpacing: 3.2 });

  // hero: split subject on ' — '
  const sep = ' — ';
  const parts = payload.subjectName.split(sep);
  const heroMain = parts[0]?.trim() || payload.subjectName;
  const heroSub = parts.length > 1 ? parts.slice(1).join(sep).trim() : payload.ticketTitle;

  doc.font(FONT_SERIF).fontSize(50).fillColor(NAVY).text(heroMain, 48, 165);
  doc.font(FONT_SERIF).fontSize(14).fillColor(GOLD_DEEP).text(heroSub, 51, 228);
  doc.rect(51, 245, 85, 3.1).fill(GOLD);

  // index rows with dotted leaders
  const rows: [string, string][] = [
    ['ATTENDEE', payload.userName],
    ['EVENT', payload.subjectName],
    ['DATE & TIME', payload.scheduledAt ? fmtTicketDate(payload.scheduledAt) : '—'],
    ['TICKET NO.', payload.ticketId],
  ];
  const labelX = 51;
  const valueRight = 510;
  const leaderStart = 175;
  let rowY = 375;
  doc.font(FONT_SANS).fontSize(7.5).fillColor(GRAY);
  for (const [label, value] of rows) {
    doc.text(label, labelX, rowY, { characterSpacing: 1.8 });
    // dotted leader
    let dx = leaderStart;
    doc.strokeColor(HAIR).lineWidth(0.8);
    while (dx < valueRight - 4) {
      doc.moveTo(dx, rowY + 5).lineTo(Math.min(dx + 4, valueRight - 4), rowY + 5).stroke();
      dx += 9;
    }
    doc.font(FONT_SANS).fontSize(11).fillColor(INK).text(value, valueRight - 300, rowY - 1.5, { width: 300, align: 'right' });
    doc.font(FONT_SANS).fontSize(7.5).fillColor(GRAY);
    rowY += 34;
  }

  // QR bottom-right
  const qrS = 108;
  const qrX = W - 52 - qrS - 14;
  const qrY = 100;
  doc.rect(qrX, qrY, qrS + 14, qrS + 14).lineWidth(1).strokeColor(NAVY).stroke();
  doc.image(qrBuffer, qrX + 7, qrY + 7, { width: qrS, height: qrS });
  doc.font(FONT_SANS).fontSize(7.5).fillColor(NAVY).text('VERIFY', qrX + 7, qrY + qrS + 20, { width: qrS, characterSpacing: 2.5, align: 'center' });

  // instruction
  doc.font(FONT_SANS).fontSize(9).fillColor(GRAY).text(payload.instructionText, 51, 680, { width: 260, lineGap: 3 });

  // footer
  doc.moveTo(51, 800).lineTo(W - 51, 800).lineWidth(0.6).strokeColor(NAVY).opacity(0.35).stroke();
  doc.opacity(1);
  doc.font(FONT_SANS).fontSize(7.5).fillColor(GRAY).text('Valid only once at check-in', 51, 812);
  doc.font(FONT_SANS).fontSize(7.5).fillColor(GRAY).text('Issued ' + fmtTicketDate(new Date()), W / 2 - 60, 812, { width: 120, align: 'center' });
  doc.font(FONT_SANS).fontSize(7.5).fillColor(GRAY).text('tcetcercd.in', W - 51 - 100, 812, { width: 100, align: 'right' });

  doc.end();
  return done;
};

const getDownloadPath = (ticketId: string) => `/api/tickets/${encodeURIComponent(ticketId)}/download`;
const getVerifyPath = (ticketId: string) => `/admin?tab=operations&ops=tickets&ticketId=${encodeURIComponent(ticketId)}`;

const toAbsoluteUrl = (path: string) => {
  const base = process.env.FRONTEND_URL || 'http://localhost:3000';
  return `${base}${path}`;
};

const issueTicket = async (input: TicketBuildInput) => {
  if (input.type === 'FACILITY_BOOKING' && !input.bookingId) {
    throw new Error('bookingId is required for facility booking tickets');
  }
  if (input.type === 'HACKATHON_SELECTION' && !input.claimId) {
    throw new Error('claimId is required for hackathon selection tickets');
  }

  const existing = await prisma.ticket.findFirst({
    where:
      input.type === 'HACKATHON_SELECTION'
        ? {
            type: input.type,
            claimId: input.claimId ?? null,
          }
        : {
            type: input.type,
            userId: input.userId,
            bookingId: input.bookingId ?? null,
          },
  });

  if (existing) {
    return {
      ticket: existing,
      created: false,
      downloadPath: getDownloadPath(existing.ticketId),
    };
  }

  const ticketId = await generateUniqueTicketId(input.type);
  const qrValue = toAbsoluteUrl(getVerifyPath(ticketId));
  const pdfBuffer = await buildPdfBuffer({
    ticketId,
    ticketTitle: input.title,
    userName: input.userName,
    subjectName: input.subjectName,
    scheduledAt: input.scheduledAt,
    instructionText: input.instructionText,
    qrValue,
  });

  const year = new Date().getUTCFullYear();
  const month = String(new Date().getUTCMonth() + 1).padStart(2, '0');
  const objectKey = `tickets/${year}/${month}/${ticketId}.pdf`;

  await uploadFileWithObjectKey(objectKey, {
    buffer: pdfBuffer,
    mimetype: 'application/pdf',
    size: pdfBuffer.length,
  });

  try {
    const ticket = await prisma.ticket.create({
      data: {
        ticketId,
        type: input.type,
        status: 'ACTIVE',
        userId: input.userId,
        bookingId: input.bookingId ?? null,
        claimId: input.claimId ?? null,
        title: input.title,
        subjectName: input.subjectName,
        scheduledAt: input.scheduledAt ?? null,
        pdfObjectKey: objectKey,
        qrValue,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    const downloadPath = getDownloadPath(ticket.ticketId);

    try {
      await sendTicketIssuedEmail(input.userEmail, {
        userName: input.userName,
        ticketTitle: ticket.title,
        ticketId: ticket.ticketId,
        subjectName: ticket.subjectName,
        scheduledAt: ticket.scheduledAt ? ticket.scheduledAt.toISOString() : null,
        ticketPdfBuffer: pdfBuffer,
        teamMembers: input.teamMembersForEmail,
      });
    } catch (mailErr) {
      logActivity('TICKET_EMAIL_DISPATCH_FAILED', {
        ticketId: ticket.ticketId,
        userId: input.userId,
        type: input.type,
        error: mailErr instanceof Error ? mailErr.message : 'UNKNOWN_ERROR',
      });
    }

    logActivity('TICKET_ISSUED', {
      ticketId: ticket.ticketId,
      userId: input.userId,
      type: input.type,
      bookingId: input.bookingId,
      claimId: input.claimId,
    });

    return {
      ticket,
      created: true,
      downloadPath,
    };
  } catch (err) {
    await deleteFile(objectKey).catch(() => null);
    throw err;
  }
};

export const issueFacilityBookingTicket = async (bookingId: number) => {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      student: { select: { id: true, name: true, email: true } },
    },
  });

  if (!booking) {
    throw new Error('Booking not found while issuing ticket');
  }

  return issueTicket({
    type: 'FACILITY_BOOKING',
    userId: booking.student.id,
    userName: booking.student.name,
    userEmail: booking.student.email,
    title: 'Booking Ticket',
    subjectName: `${booking.lab} Facility Booking`,
    scheduledAt: bookingDateTimeFromIST(booking.date, booking.timeSlot),
    instructionText: 'Present this ticket at entry. Ticket is valid for one check-in only.',
    bookingId: booking.id,
    metadata: {
      bookingId: booking.id,
      timeSlot: booking.timeSlot,
      lab: booking.lab,
    },
  });
};

export const issueHackathonSelectionTicketsForClaim = async (claimId: number) => {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: {
      problem: {
        include: {
          event: { select: { id: true, title: true, startTime: true, endTime: true, totalSessions: true } },
        },
      },
      members: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!claim) {
    throw new Error('Claim not found while issuing hackathon tickets');
  }

  if (!claim.problem.event) {
    throw new Error('Hackathon event not found for accepted claim ticket issuance');
  }

  if (claim.members.length === 0) {
    throw new Error('Claim has no members for team ticket issuance');
  }

  const leaderMember = claim.members.find((member) => member.role === 'LEAD') ?? claim.members[0];

  const result = await issueTicket({
    type: 'HACKATHON_SELECTION',
    userId: leaderMember.user.id,
    userName: leaderMember.user.name,
    userEmail: leaderMember.user.email,
    title: 'Hackathon Team Ticket',
    subjectName: `${claim.problem.event.title} - ${claim.problem.title}`,
    scheduledAt: claim.problem.event.startTime,
    instructionText: 'Present this team ticket at check-in. Mark attendance for members who are present.',
    claimId: claim.id,
    metadata: {
      claimId: claim.id,
      eventId: claim.problem.event.id,
      eventTitle: claim.problem.event.title,
      problemId: claim.problemId,
      problemTitle: claim.problem.title,
      teamName: claim.teamName,
      teamLeadUserId: leaderMember.user.id,
      teamMemberCount: claim.members.length,
    },
    teamMembersForEmail: claim.members.map((member) => ({
      name: member.user.name,
      email: member.user.email,
      role: member.role,
    })),
  });

  const ticketAttendanceModel = (prisma as any).ticketAttendance;
  if (ticketAttendanceModel) {
    await ticketAttendanceModel.createMany({
      data: claim.members.map((member) => ({
        ticketId: result.ticket.id,
        claimId: claim.id,
        userId: member.userId,
        claimMemberId: member.id,
        session: 1,
        status: 'NOT_PRESENT',
      })),
      skipDuplicates: true,
    });
  }

  return {
    ticketId: result.ticket.ticketId,
    userId: leaderMember.user.id,
    created: result.created,
    memberCount: claim.members.length,
  };
};

export const verifyAndConsumeTicket = async (ticketId: string, verifiedByUserId?: number) => {
  const ticket = await prisma.ticket.findUnique({
    where: { ticketId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  if (!ticket) {
    return { ok: false as const, code: 'NOT_FOUND' as const };
  }

  if (ticket.type !== 'FACILITY_BOOKING') {
    return { ok: false as const, code: 'WRONG_TICKET_TYPE' as const, ticket };
  }

  if (ticket.status === 'CANCELLED') {
    return { ok: false as const, code: 'CANCELLED' as const, ticket };
  }

  const consumed = await prisma.ticket.updateMany({
    where: { ticketId, status: 'ACTIVE' },
    data: {
      status: 'USED',
      usedAt: new Date(),
      metadata: {
        ...((ticket.metadata as Record<string, unknown> | null) ?? {}),
        lastVerifiedByUserId: verifiedByUserId ?? null,
        lastVerifiedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  if (consumed.count === 0) {
    const latest = await prisma.ticket.findUnique({ where: { ticketId } });
    return {
      ok: false as const,
      code: latest?.status === 'USED' ? ('ALREADY_USED' as const) : ('INVALID_STATE' as const),
      ticket: latest ?? ticket,
    };
  }

  const updated = await prisma.ticket.findUnique({
    where: { ticketId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  logActivity('TICKET_VERIFIED_AND_CONSUMED', {
    ticketId,
    verifiedByUserId: verifiedByUserId ?? null,
    ticketUserId: updated?.userId ?? ticket.userId,
    type: updated?.type ?? ticket.type,
  });

  return { ok: true as const, ticket: updated ?? ticket };
};

const getHackathonTicketRecord = async (ticketId: string, session = 1) => {
  const ticketModel = (prisma as any).ticket;
  const ticketAttendanceModel = (prisma as any).ticketAttendance;

  let ticket = await ticketModel.findUnique({
    where: { ticketId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      claim: {
        include: {
          problem: {
            include: {
              event: { select: { id: true, title: true, totalSessions: true } },
            },
          },
          members: {
            include: {
              user: { select: { id: true, name: true, email: true, uid: true } },
            },
          },
        },
      },
      attendanceRecords: {
        where: {
          session,
        },
      },
    },
  });

  if (!ticket || ticket.type !== 'HACKATHON_SELECTION' || !ticket.claim) {
    return ticket;
  }

  if (ticketAttendanceModel && ticket.claim.members.length > 0) {
    await ticketAttendanceModel.createMany({
      data: ticket.claim.members.map((member: any) => ({
        ticketId: ticket.id,
        claimId: ticket.claim.id,
        userId: member.user.id,
        claimMemberId: member.id,
        session,
        status: 'NOT_PRESENT',
      })),
      skipDuplicates: true,
    });

    ticket = await ticketModel.findUnique({
      where: { ticketId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        claim: {
          include: {
            problem: {
              include: {
                event: { select: { id: true, title: true, totalSessions: true } },
              },
            },
            members: {
              include: {
                user: { select: { id: true, name: true, email: true, uid: true } },
              },
            },
          },
        },
        attendanceRecords: {
          where: {
            session,
          },
        },
      },
    });
  }

  return ticket;
};

const mapAttendanceMembers = (ticket: any, session: number): AttendanceMemberRow[] => {
  const attendanceByClaimMemberId = new Map<number, any>();
  for (const record of ticket?.attendanceRecords || []) {
    attendanceByClaimMemberId.set(record.claimMemberId, record);
  }

  return (ticket?.claim?.members || []).map((member: any) => {
    const attendance = attendanceByClaimMemberId.get(member.id);
    return {
      claimMemberId: member.id,
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
      uid: member.user.uid ?? null,
      role: member.role,
      session,
      attendanceStatus: (attendance?.status || 'NOT_PRESENT') as 'NOT_PRESENT' | 'PRESENT',
      checkedInAt: attendance?.checkedInAt ? new Date(attendance.checkedInAt).toISOString() : null,
    };
  });
};

const isHackathonAttendanceComplete = async (ticketId: number, totalMembers: number, totalSessions: number) => {
  if (totalMembers <= 0 || totalSessions <= 0) return false;

  const attendanceRows = await prisma.ticketAttendance.findMany({
    where: {
      ticketId,
      session: {
        lte: totalSessions,
      },
    },
    select: {
      session: true,
      claimMemberId: true,
      status: true,
    },
  });

  const sessionPresence = new Map<number, Set<number>>();

  for (const row of attendanceRows) {
    if (row.status !== 'PRESENT') continue;
    if (!sessionPresence.has(row.session)) {
      sessionPresence.set(row.session, new Set<number>());
    }
    sessionPresence.get(row.session)?.add(row.claimMemberId);
  }

  for (let session = 1; session <= totalSessions; session += 1) {
    const presentSet = sessionPresence.get(session);
    if (!presentSet || presentSet.size < totalMembers) {
      return false;
    }
  }

  return true;
};

export const syncHackathonTicketUsageStatus = async (ticketId: number, totalMembers: number, totalSessions: number) => {
  const complete = await isHackathonAttendanceComplete(ticketId, totalMembers, totalSessions);

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, status: true },
  });

  if (!ticket) {
    return { status: null as 'ACTIVE' | 'USED' | 'CANCELLED' | null, changed: false };
  }

  if (ticket.status === 'CANCELLED') {
    return { status: 'CANCELLED' as const, changed: false };
  }

  if (complete && ticket.status !== 'USED') {
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'USED',
        usedAt: new Date(),
      },
    });
    return { status: 'USED' as const, changed: true };
  }

  if (!complete && ticket.status === 'USED') {
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'ACTIVE',
        usedAt: null,
      },
    });
    return { status: 'ACTIVE' as const, changed: true };
  }

  return { status: ticket.status as 'ACTIVE' | 'USED' | 'CANCELLED', changed: false };
};

export const verifyTicketForCheckIn = async (ticketId: string, session = 1) => {
  if (!Number.isInteger(session) || session <= 0) {
    return { ok: false as const, code: 'INVALID_SESSION' as const };
  }

  const ticketModel = (prisma as any).ticket;
  const base = await ticketModel.findUnique({
    where: { ticketId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  if (!base) {
    return { ok: false as const, code: 'NOT_FOUND' as const };
  }

  if (base.status === 'CANCELLED') {
    return { ok: false as const, code: 'CANCELLED' as const, ticket: base };
  }

  if (base.type === 'FACILITY_BOOKING') {
    return {
      ok: true as const,
      mode: 'FACILITY' as const,
      ticket: base,
    };
  }

  const hackathonTicket = await getHackathonTicketRecord(ticketId, session);
  if (!hackathonTicket || !hackathonTicket.claim) {
    return { ok: false as const, code: 'INVALID_HACKATHON_TICKET' as const };
  }

  const totalSessions = hackathonTicket.claim.problem?.event?.totalSessions ?? 1;
  if (session > totalSessions) {
    return { ok: false as const, code: 'INVALID_SESSION' as const };
  }

  const members = mapAttendanceMembers(hackathonTicket, session);
  const presentCount = members.filter((member) => member.attendanceStatus === 'PRESENT').length;

  return {
    ok: true as const,
    mode: 'HACKATHON' as const,
    ticket: hackathonTicket,
    claimId: hackathonTicket.claim.id,
    teamName: hackathonTicket.claim.teamName || `Team-${hackathonTicket.claim.id}`,
    eventName: hackathonTicket.claim.problem?.event?.title || 'Hackathon Event',
    session,
    totalSessions,
    members,
    presentCount,
    totalMembers: members.length,
  };
};

export const markHackathonTeamMembersPresent = async (
  ticketId: string,
  presentClaimMemberIds: number[],
  checkedInByUserId?: number,
  session = 1
) => {
  if (!Number.isInteger(session) || session <= 0) {
    return { ok: false as const, code: 'INVALID_SESSION' as const };
  }

  const ticketAttendanceModel = (prisma as any).ticketAttendance;
  if (!ticketAttendanceModel) {
    throw new Error('Ticket attendance model is unavailable');
  }

  const ticket = await getHackathonTicketRecord(ticketId, session);

  if (!ticket) {
    return { ok: false as const, code: 'NOT_FOUND' as const };
  }

  if (ticket.status === 'CANCELLED') {
    return { ok: false as const, code: 'CANCELLED' as const, ticket };
  }

  if (ticket.type !== 'HACKATHON_SELECTION' || !ticket.claim) {
    return { ok: false as const, code: 'WRONG_TICKET_TYPE' as const, ticket };
  }

  // Attendance is only meaningful inside the event window — no marking before
  // the event starts or after it ends (multi-session events share this window).
  const event = ticket.claim.problem?.event ?? null;
  if (event) {
    const now = new Date();
    if (now < event.startTime || now > event.endTime) {
      return { ok: false as const, code: 'OUTSIDE_EVENT_WINDOW' as const, ticket };
    }
  }

  const totalSessions = ticket.claim.problem?.event?.totalSessions ?? 1;
  if (session > totalSessions) {
    return { ok: false as const, code: 'INVALID_SESSION' as const, ticket };
  }

  if (ticket.claim.members.length > 0) {
    await ticketAttendanceModel.createMany({
      data: ticket.claim.members.map((member: any) => ({
        ticketId: ticket.id,
        claimId: ticket.claim.id,
        userId: member.user.id,
        claimMemberId: member.id,
        session,
        status: 'NOT_PRESENT',
      })),
      skipDuplicates: true,
    });
  }

  const validMemberIds = new Set<number>((ticket.claim.members || []).map((member: any) => member.id));
  const selectedUnique = Array.from(
    new Set(presentClaimMemberIds.filter((claimMemberId) => Number.isInteger(claimMemberId) && validMemberIds.has(claimMemberId)))
  );

  let newlyMarkedCount = 0;
  if (selectedUnique.length > 0) {
    const updateResult = await ticketAttendanceModel.updateMany({
      where: {
        ticketId: ticket.id,
        session,
        claimMemberId: { in: selectedUnique },
        status: 'NOT_PRESENT',
      },
      data: {
        status: 'PRESENT',
        checkedInAt: new Date(),
        checkedInByUserId: checkedInByUserId ?? null,
      },
    });

    newlyMarkedCount = updateResult.count ?? 0;
  }

  const updated = await getHackathonTicketRecord(ticketId, session);
  if (!updated || !updated.claim) {
    return { ok: false as const, code: 'NOT_FOUND' as const };
  }

  const members = mapAttendanceMembers(updated, session);
  const presentCount = members.filter((member) => member.attendanceStatus === 'PRESENT').length;
  const totalMembers = members.length;

  const statusSync = await syncHackathonTicketUsageStatus(updated.id, totalMembers, totalSessions);
  if (statusSync.status) {
    updated.status = statusSync.status;
  }

  logActivity('HACKATHON_MEMBER_ATTENDANCE_MARKED', {
    ticketId: updated.ticketId,
    claimId: updated.claim.id,
    markedBy: checkedInByUserId ?? null,
    session,
    newlyMarkedCount,
    presentCount,
    totalMembers,
  });

  return {
    ok: true as const,
    ticket: updated,
    claimId: updated.claim.id,
    teamName: updated.claim.teamName || `Team-${updated.claim.id}`,
    eventName: updated.claim.problem?.event?.title || 'Hackathon Event',
    session,
    totalSessions,
    members,
    presentCount,
    totalMembers,
    newlyMarkedCount,
  };
};
