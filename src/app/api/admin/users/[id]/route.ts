import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { getSignedUrl } from '@/lib/minio';
import { getStoredFileDisplayName } from '@/lib/innovation';

// GET /api/admin/users/[id] — detailed user profile for admin modal
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = authenticate(req);
    if (!admin) return errorRes('Unauthorized', [], 401);
    if (!authorize(admin, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { id } = await params;
    const userId = Number(id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return errorRes('Validation failed', ['A valid user id is required'], 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        uid: true,
        isVerified: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        industryId: true,
      },
    });

    if (!user) return errorRes('User not found', [], 404);

    const [industry, studentProfileRaw, bookings, applications, tickets, problemsAuthored, claimMembershipsRaw, counts] = await Promise.all([
      user.industryId
        ? prisma.industry.findUnique({
            where: { id: user.industryId },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
      prisma.studentProfile.findUnique({
        where: { userId },
        select: {
          id: true,
          skills: true,
          experience: true,
          interests: true,
          resumeUrl: true,
          isComplete: true,
          updatedAt: true,
        },
      }),
      prisma.booking.findMany({
        where: { studentId: userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          purpose: true,
          date: true,
          timeSlot: true,
          lab: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.application.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          problem: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      }),
      prisma.ticket.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          ticketId: true,
          type: true,
          status: true,
          title: true,
          subjectName: true,
          scheduledAt: true,
          issuedAt: true,
          usedAt: true,
          cancelledAt: true,
        },
      }),
      prisma.problem.findMany({
        where: { createdById: userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          title: true,
          mode: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.claimMember.findMany({
        where: { userId },
        orderBy: { id: 'desc' },
        take: 20,
        select: {
          id: true,
          role: true,
          claim: {
            select: {
              id: true,
              teamName: true,
              status: true,
              updatedAt: true,
              problem: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          },
        },
      }),
      Promise.all([
        prisma.booking.count({ where: { studentId: userId } }),
        prisma.application.count({ where: { userId } }),
        prisma.ticket.count({ where: { userId } }),
        prisma.problem.count({ where: { createdById: userId } }),
        prisma.claimMember.count({ where: { userId } }),
      ]),
    ]);

    const studentProfile = studentProfileRaw
      ? {
          ...studentProfileRaw,
          resumeFileName: getStoredFileDisplayName(studentProfileRaw.resumeUrl),
          resumeDownloadUrl: studentProfileRaw.resumeUrl
            ? await getSignedUrl(studentProfileRaw.resumeUrl).catch(() => null)
            : null,
        }
      : null;

    return successRes(
      {
        ...user,
        industry,
        studentProfile,
        bookings,
        applications,
        tickets,
        problemsAuthored,
        claimMemberships: claimMembershipsRaw,
        _count: {
          bookings: counts[0],
          applications: counts[1],
          tickets: counts[2],
          problemsAuthored: counts[3],
          problemsCreated: counts[4],
        },
      },
      'User details retrieved successfully.',
    );
  } catch (err) {
    console.error('Admin user details GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
