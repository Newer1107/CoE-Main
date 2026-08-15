import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { logActivity } from '@/lib/activity-log';

const NAME_RE = /^[A-Za-z][A-Za-z .'-]{1,79}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// PUT /api/admin/users/[id] — admin edits a user's details (corrections/verification).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = authenticate(req);
    if (!admin) return errorRes('Unauthorized', [], 401);
    if (!authorize(admin, 'ADMIN')) return errorRes('Admins only', [], 403);

    const userId = Number((await params).id);
    if (!Number.isInteger(userId)) return errorRes('Invalid user id', [], 400);

    const body = (await req.json().catch(() => null)) as {
      name?: string;
      email?: string;
      uid?: string | null;
      phone?: string | null;
      role?: string;
      status?: string;
      isVerified?: boolean;
    } | null;
    if (!body) return errorRes('Invalid request body', [], 400);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return errorRes('User not found', [], 404);

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (name.length < 2 || name.length > 80 || !NAME_RE.test(name)) return errorRes('Invalid name', [], 400);
      data.name = name;
    }
    if (body.email !== undefined) {
      const email = body.email.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return errorRes('Invalid email', [], 400);
      const dup = await prisma.user.findFirst({ where: { email, id: { not: userId } }, select: { id: true } });
      if (dup) return errorRes('Email already in use by another account', [], 409);
      data.email = email;
    }
    if (body.uid !== undefined) data.uid = (body.uid ?? '').trim().toUpperCase() || null;
    if (body.phone !== undefined) data.phone = (body.phone ?? '').trim() || null;
    if (body.role !== undefined) {
      if (!['STUDENT', 'FACULTY', 'ADMIN'].includes(body.role)) return errorRes('Invalid role', [], 400);
      data.role = body.role;
    }
    if (body.status !== undefined) {
      if (!['ACTIVE', 'PENDING', 'REJECTED'].includes(body.status)) return errorRes('Invalid status', [], 400);
      data.status = body.status;
    }
    if (body.isVerified !== undefined) data.isVerified = !!body.isVerified;

    if (Object.keys(data).length === 0) return errorRes('Nothing to update', [], 400);

    const updated = await prisma.user.update({ where: { id: userId }, data, select: { id: true, name: true, email: true, uid: true, role: true, status: true, isVerified: true } });

    logActivity('ADMIN_USER_UPDATED', { adminId: admin.id, targetUserId: userId, changes: Object.keys(data) });

    return successRes(updated, 'User updated');
  } catch (err) {
    console.error('admin user update error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// DELETE /api/admin/users/[id] — PERMANENT removal. All related rows are purged
// (claims, profiles, bookings, tickets, interests, feedback, …) in one transaction;
// problems/events the user created are reassigned to the deleting admin. The email
// is freed immediately, so the person can register again.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = authenticate(req);
    if (!admin) return errorRes('Unauthorized', [], 401);
    if (!authorize(admin, 'ADMIN')) return errorRes('Admins only', [], 403);

    const userId = Number((await params).id);
    if (!Number.isInteger(userId)) return errorRes('Invalid user id', [], 400);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return errorRes('User not found', [], 404);
    if (user.id === admin.id) return errorRes('Cannot delete your own account', [], 400);

    const purged: Record<string, number> = {};

    await prisma.$transaction(async (tx) => {
      // attendance marks + tickets (tickets cascade their attendance rows)
      purged.ticketAttendance = await tx.ticketAttendance.deleteMany({ where: { userId } }).then((r) => r.count);
      purged.tickets = await tx.ticket.deleteMany({ where: { userId } }).then((r) => r.count);

      // team memberships; claims left with zero members are removed (rubric scores,
      // session documents and upload locks cascade with them)
      const memberClaims = await tx.claimMember.findMany({ where: { userId }, select: { claimId: true } });
      purged.claimMembers = await tx.claimMember.deleteMany({ where: { userId } }).then((r) => r.count);
      const claimIds = [...new Set(memberClaims.map((m) => m.claimId))];
      let claimsRemoved = 0;
      for (const claimId of claimIds) {
        const remaining = await tx.claimMember.count({ where: { claimId } });
        if (remaining === 0) {
          await tx.claim.delete({ where: { id: claimId } });
          claimsRemoved += 1;
        }
      }
      purged.claims = claimsRemoved;

      purged.sessionDocuments = await tx.sessionDocument.deleteMany({ where: { uploadedByUserId: userId } }).then((r) => r.count);
      purged.bookings = await tx.booking.deleteMany({ where: { studentId: userId } }).then((r) => r.count);
      purged.hackathonInterests = await tx.hackathonInterest.deleteMany({ where: { userId } }).then((r) => r.count);
      purged.programInterests = await tx.programInterest.deleteMany({ where: { userId } }).then((r) => r.count);
      purged.opportunityInterests = await tx.opportunityInterest.deleteMany({ where: { userId } }).then((r) => r.count);
      purged.notifications = await tx.notification.deleteMany({ where: { userId } }).then((r) => r.count);
      purged.certificates = await tx.certificate.deleteMany({ where: { userId } }).then((r) => r.count);
      purged.studentProfile = await tx.studentProfile.deleteMany({ where: { userId } }).then((r) => r.count);
      purged.facultyProfile = await tx.facultyProfile.deleteMany({ where: { userId } }).then((r) => r.count);
      purged.applications = await tx.application.deleteMany({ where: { userId } }).then((r) => r.count);
      purged.judgeAssignments = await tx.judgeAssignment.deleteMany({ where: { judgeId: userId } }).then((r) => r.count);
      purged.eventFeedback = await tx.eventFeedback.deleteMany({ where: { userId } }).then((r) => r.count);
      purged.attendanceRefreshLimits = await tx.attendanceRefreshLimit.deleteMany({ where: { userId } }).then((r) => r.count);
      purged.impersonationSessions = await tx.impersonationSession.deleteMany({
        where: { OR: [{ targetUserId: userId }, { adminId: userId }] },
      }).then((r) => r.count);
      purged.otps = await tx.otp.deleteMany({ where: { email: user.email } }).then((r) => r.count);

      // created problems/events are reassigned (NOT cascade-deleted)
      purged.problemsReassigned = await tx.problem.updateMany({ where: { createdById: userId }, data: { createdById: admin.id } }).then((r) => r.count);
      purged.eventsReassigned = await tx.hackathonEvent.updateMany({ where: { createdById: userId }, data: { createdById: admin.id } }).then((r) => r.count);
      purged.eventsUncoordinated = await tx.hackathonEvent.updateMany({ where: { coordinatorId: userId }, data: { coordinatorId: null } }).then((r) => r.count);

      await tx.user.delete({ where: { id: userId } });
    });

    logActivity('ADMIN_USER_PURGED', { adminId: admin.id, targetUserId: userId, targetEmail: user.email, purged });

    return successRes(
      { deleted: true, purged },
      `User permanently deleted — email ${user.email} is freed and can register again`
    );
  } catch (err) {
    console.error('admin user purge error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
