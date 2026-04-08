import crypto from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { deleteFile, uploadFileWithObjectKey } from '@/lib/minio';
import { logActivity } from '@/lib/activity-log';
import { sendTicketIssuedEmail } from '@/lib/mailer';

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
  attendanceStatus: 'NOT_PRESENT' | 'PRESENT';
  checkedInAt: string | null;
};

const platformName = 'TCET Center of Excellence';

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

const buildPdfBuffer = async (payload: {
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

  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const pageHeight = page.getHeight();

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const qrImage = await doc.embedPng(qrBuffer);

  const topToY = (top: number, fontSize = 0) => pageHeight - top - fontSize;

  page.drawRectangle({
    x: 48,
    y: pageHeight - 48 - 74,
    width: 499,
    height: 74,
    color: rgb(0, 0.129, 0.333),
  });

  page.drawText(platformName, {
    x: 64,
    y: topToY(72, 20),
    size: 20,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText('DIGITAL TICKET', {
    x: 64,
    y: topToY(130, 11),
    size: 11,
    font: fontBold,
    color: rgb(0.549, 0.31, 0),
  });

  page.drawText(payload.ticketTitle, {
    x: 64,
    y: topToY(146, 24),
    size: 24,
    font: fontBold,
    color: rgb(0, 0.129, 0.333),
  });

  const rowStart = 196;
  const rowGap = 28;
  const labelColor = rgb(0.263, 0.275, 0.318);
  const valueColor = rgb(0, 0.129, 0.333);

  const drawRow = (label: string, value: string, index: number) => {
    const top = rowStart + rowGap * index;
    page.drawText(label, {
      x: 64,
      y: topToY(top, 11),
      size: 11,
      font: fontRegular,
      color: labelColor,
    });
    page.drawText(value, {
      x: 190,
      y: topToY(top, 13),
      size: 13,
      font: fontBold,
      color: valueColor,
    });
  };

  drawRow('Ticket ID', payload.ticketId, 0);
  drawRow('User', payload.userName, 1);
  drawRow('Event / Booking', payload.subjectName, 2);
  drawRow('Date & Time', formatDateTime(payload.scheduledAt), 3);

  page.drawRectangle({
    x: 64,
    y: pageHeight - 330 - 82,
    width: 300,
    height: 82,
    borderWidth: 1,
    borderColor: rgb(0.769, 0.776, 0.827),
  });

  page.drawText('Instruction', {
    x: 78,
    y: topToY(346, 10),
    size: 10,
    font: fontRegular,
    color: labelColor,
  });

  page.drawText(payload.instructionText, {
    x: 78,
    y: topToY(364, 12),
    size: 12,
    font: fontRegular,
    color: valueColor,
    maxWidth: 272,
    lineHeight: 14,
  });

  page.drawImage(qrImage, {
    x: 390,
    y: pageHeight - 326 - 150,
    width: 150,
    height: 150,
  });

  page.drawText('QR contains ticket identifier for verification', {
    x: 376,
    y: topToY(486, 9),
    size: 9,
    font: fontRegular,
    color: rgb(0.455, 0.467, 0.51),
    maxWidth: 180,
    lineHeight: 11,
  });

  page.drawLine({
    start: { x: 64, y: pageHeight - 525 },
    end: { x: 547, y: pageHeight - 525 },
    thickness: 1,
    color: rgb(0.847, 0.855, 0.902),
  });

  page.drawText('This ticket is system-generated and valid only once at check-in.', {
    x: 64,
    y: topToY(538, 10),
    size: 10,
    font: fontRegular,
    color: rgb(0.455, 0.467, 0.51),
  });

  page.drawText(`Issued at: ${formatDateTime(new Date())}`, {
    x: 64,
    y: topToY(555, 10),
    size: 10,
    font: fontRegular,
    color: rgb(0.455, 0.467, 0.51),
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
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

const getBookingStartDateTime = (date: Date, timeSlot: string) => {
  const [startRaw] = timeSlot.split(' - ');
  const [hours, minutes] = startRaw.split(':').map(Number);

  const combined = new Date(date);
  if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
    combined.setHours(hours, minutes, 0, 0);
  }
  return combined;
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
    scheduledAt: getBookingStartDateTime(booking.date, booking.timeSlot),
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
          event: { select: { id: true, title: true, startTime: true, endTime: true } },
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
        claimMemberId: member.id,
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

const getHackathonTicketRecord = async (ticketId: string) => {
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
              event: { select: { id: true, title: true } },
            },
          },
          members: {
            include: {
              user: { select: { id: true, name: true, email: true, uid: true } },
            },
          },
        },
      },
      attendanceRecords: true,
    },
  });

  if (!ticket || ticket.type !== 'HACKATHON_SELECTION' || !ticket.claim) {
    return ticket;
  }

  if (ticketAttendanceModel && ticket.claim.members.length > 0) {
    await ticketAttendanceModel.createMany({
      data: ticket.claim.members.map((member: any) => ({
        ticketId: ticket.id,
        claimMemberId: member.id,
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
                event: { select: { id: true, title: true } },
              },
            },
            members: {
              include: {
                user: { select: { id: true, name: true, email: true, uid: true } },
              },
            },
          },
        },
        attendanceRecords: true,
      },
    });
  }

  return ticket;
};

const mapAttendanceMembers = (ticket: any): AttendanceMemberRow[] => {
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
      attendanceStatus: (attendance?.status || 'NOT_PRESENT') as 'NOT_PRESENT' | 'PRESENT',
      checkedInAt: attendance?.checkedInAt ? new Date(attendance.checkedInAt).toISOString() : null,
    };
  });
};

export const verifyTicketForCheckIn = async (ticketId: string) => {
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

  const hackathonTicket = await getHackathonTicketRecord(ticketId);
  if (!hackathonTicket || !hackathonTicket.claim) {
    return { ok: false as const, code: 'INVALID_HACKATHON_TICKET' as const };
  }

  const members = mapAttendanceMembers(hackathonTicket);
  const presentCount = members.filter((member) => member.attendanceStatus === 'PRESENT').length;

  return {
    ok: true as const,
    mode: 'HACKATHON' as const,
    ticket: hackathonTicket,
    claimId: hackathonTicket.claim.id,
    teamName: hackathonTicket.claim.teamName || `Team-${hackathonTicket.claim.id}`,
    eventName: hackathonTicket.claim.problem?.event?.title || 'Hackathon Event',
    members,
    presentCount,
    totalMembers: members.length,
  };
};

export const markHackathonTeamMembersPresent = async (
  ticketId: string,
  presentClaimMemberIds: number[],
  checkedInByUserId?: number
) => {
  const ticketAttendanceModel = (prisma as any).ticketAttendance;
  if (!ticketAttendanceModel) {
    throw new Error('Ticket attendance model is unavailable');
  }

  const ticket = await getHackathonTicketRecord(ticketId);

  if (!ticket) {
    return { ok: false as const, code: 'NOT_FOUND' as const };
  }

  if (ticket.status === 'CANCELLED') {
    return { ok: false as const, code: 'CANCELLED' as const, ticket };
  }

  if (ticket.type !== 'HACKATHON_SELECTION' || !ticket.claim) {
    return { ok: false as const, code: 'WRONG_TICKET_TYPE' as const, ticket };
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

  const updated = await getHackathonTicketRecord(ticketId);
  if (!updated || !updated.claim) {
    return { ok: false as const, code: 'NOT_FOUND' as const };
  }

  const members = mapAttendanceMembers(updated);
  const presentCount = members.filter((member) => member.attendanceStatus === 'PRESENT').length;
  const totalMembers = members.length;

  if (totalMembers > 0 && presentCount === totalMembers && updated.status === 'ACTIVE') {
    await (prisma as any).ticket.update({
      where: { id: updated.id },
      data: {
        status: 'USED',
        usedAt: new Date(),
        metadata: {
          ...((updated.metadata as Record<string, unknown> | null) ?? {}),
          attendanceCompletedAt: new Date().toISOString(),
          attendanceCompletedByUserId: checkedInByUserId ?? null,
        } as Prisma.InputJsonValue,
      },
    });
    updated.status = 'USED';
  }

  logActivity('HACKATHON_MEMBER_ATTENDANCE_MARKED', {
    ticketId: updated.ticketId,
    claimId: updated.claim.id,
    markedBy: checkedInByUserId ?? null,
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
    members,
    presentCount,
    totalMembers,
    newlyMarkedCount,
  };
};
