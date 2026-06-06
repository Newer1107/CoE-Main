import type { DatabaseType, HostingRequestStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { sendHostingRequestApprovedEmail, sendHostingRequestChangesRequestedEmail, sendHostingRequestRejectedEmail, sendHostingRequestSubmittedEmail } from '@/lib/mailer';
import { createNotifications } from '@/lib/notifications';
import { getStudentIdentitySnapshot } from '@/lib/student-identity';

const hostingRequestInclude = {
  student: {
    select: {
      id: true,
      name: true,
      email: true,
      uid: true,
      studentProfile: {
        select: {
          id: true,
          skills: true,
          experience: true,
          interests: true,
          isComplete: true,
          updatedAt: true,
        },
      },
    },
  },
  reviewedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  statusHistory: {
    orderBy: {
      createdAt: 'desc' as const,
    },
    include: {
      changedBy: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  },
} satisfies Prisma.HostingRequestInclude;

export type HostingRequestWithRelations = Prisma.HostingRequestGetPayload<{
  include: typeof hostingRequestInclude;
}>;

export type HostingRequestPayload = {
  projectName: string;
  projectDescription: string;
  githubUrl: string;
  projectCategory: string;
  techStack: string[];
  databaseRequired: boolean;
  databaseType: DatabaseType;
  preferredSubdomain: string;
  teamMembers?: string | null;
  facultyMentor?: string | null;
  hostingDuration?: string | null;
  additionalNotes?: string | null;
};

export type HostingReviewPayload = {
  status: HostingRequestStatus;
  adminRemarks: string;
  assignedDomain?: string | null;
  deploymentStatus?: string | null;
  coolifyProjectId?: string | null;
  assignedDatabaseCredentials?: Record<string, unknown> | null;
  hostingExpiryDate?: string | null;
};

const formatStatus = (status: HostingRequestStatus) => status.replaceAll('_', ' ');

const normalizeOptional = (value: string | null | undefined) => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

export const serializeHostingRequest = (record: HostingRequestWithRelations) => ({
  id: record.id,
  projectName: record.projectName,
  projectDescription: record.projectDescription,
  githubUrl: record.githubUrl,
  projectCategory: record.projectCategory,
  techStack: Array.isArray(record.techStack) ? record.techStack.map((item) => String(item)) : [],
  databaseRequired: record.databaseRequired,
  databaseType: record.databaseType,
  preferredSubdomain: record.preferredSubdomain,
  teamMembers: record.teamMembers,
  facultyMentor: record.facultyMentor,
  hostingDuration: record.hostingDuration,
  additionalNotes: record.additionalNotes,
  adminRemarks: record.adminRemarks,
  status: record.status,
  reviewedAt: record.reviewedAt?.toISOString() ?? null,
  assignedDomain: record.assignedDomain,
  coolifyProjectId: record.coolifyProjectId,
  deploymentStatus: record.deploymentStatus,
  assignedDatabaseCredentials:
    record.assignedDatabaseCredentials && typeof record.assignedDatabaseCredentials === 'object' && !Array.isArray(record.assignedDatabaseCredentials)
      ? (record.assignedDatabaseCredentials as Record<string, unknown>)
      : null,
  hostingExpiryDate: record.hostingExpiryDate?.toISOString() ?? null,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
  student: {
    id: record.student.id,
    ...getStudentIdentitySnapshot(record.student),
    studentProfile: record.student.studentProfile
      ? {
          id: record.student.studentProfile.id,
          skills: record.student.studentProfile.skills,
          experience: record.student.studentProfile.experience,
          interests: record.student.studentProfile.interests,
          isComplete: record.student.studentProfile.isComplete,
          updatedAt: record.student.studentProfile.updatedAt.toISOString(),
        }
      : null,
  },
  reviewedBy: record.reviewedBy
    ? {
        id: record.reviewedBy.id,
        name: record.reviewedBy.name,
        email: record.reviewedBy.email,
      }
    : null,
  statusHistory: record.statusHistory.map((entry) => ({
    id: entry.id,
    oldStatus: entry.oldStatus,
    newStatus: entry.newStatus,
    remarks: entry.remarks,
    createdAt: entry.createdAt.toISOString(),
    changedBy: {
      id: entry.changedBy.id,
      name: entry.changedBy.name,
      email: entry.changedBy.email,
      role: entry.changedBy.role,
    },
  })),
});

const buildAdminWhere = (filters?: { status?: HostingRequestStatus | 'ALL'; search?: string }) => {
  const status = filters?.status && filters.status !== 'ALL' ? filters.status : undefined;
  const search = filters?.search?.trim();

  const where: Prisma.HostingRequestWhereInput = {};

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { projectName: { contains: search } },
      { projectCategory: { contains: search } },
      { preferredSubdomain: { contains: search } },
      { student: { name: { contains: search } } },
      { student: { email: { contains: search } } },
      { student: { uid: { contains: search } } },
    ];
  }

  return where;
};

export const getStudentHostingDashboardData = async (studentId: number) => {
  const [user, requests, totalRequests, approvedRequests, pendingRequests] = await Promise.all([
    prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        name: true,
        email: true,
        uid: true,
        studentProfile: {
          select: {
            id: true,
            skills: true,
            experience: true,
            interests: true,
            isComplete: true,
            updatedAt: true,
          },
        },
      },
    }),
    prisma.hostingRequest.findMany({
      where: { studentId },
      include: hostingRequestInclude,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.hostingRequest.count({ where: { studentId } }),
    prisma.hostingRequest.count({ where: { studentId, status: 'APPROVED' } }),
    prisma.hostingRequest.count({
      where: {
        studentId,
        status: { in: ['PENDING', 'UNDER_REVIEW', 'CHANGES_REQUESTED'] },
      },
    }),
  ]);

  if (!user) {
    throw new Error('Student account not found.');
  }

  return {
    student: {
      id: user.id,
      ...getStudentIdentitySnapshot(user),
      studentProfile: user.studentProfile
        ? {
            id: user.studentProfile.id,
            skills: user.studentProfile.skills,
            experience: user.studentProfile.experience,
            interests: user.studentProfile.interests,
            isComplete: user.studentProfile.isComplete,
            updatedAt: user.studentProfile.updatedAt.toISOString(),
          }
        : null,
    },
    stats: {
      totalRequests,
      approvedRequests,
      pendingRequests,
    },
    requests: requests.map(serializeHostingRequest),
  };
};

export const getAdminHostingDashboardData = async (filters?: { status?: HostingRequestStatus | 'ALL'; search?: string }) => {
  const where = buildAdminWhere(filters);

  const [requests, totalRequests, pendingReview, approved, rejected] = await Promise.all([
    prisma.hostingRequest.findMany({
      where,
      include: hostingRequestInclude,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.hostingRequest.count(),
    prisma.hostingRequest.count({ where: { status: { in: ['PENDING', 'UNDER_REVIEW'] } } }),
    prisma.hostingRequest.count({ where: { status: 'APPROVED' } }),
    prisma.hostingRequest.count({ where: { status: 'REJECTED' } }),
  ]);

  return {
    stats: {
      totalRequests,
      pendingReview,
      approved,
      rejected,
    },
    requests: requests.map(serializeHostingRequest),
  };
};

export const getHostingRequestById = async (requestId: number) => {
  const request = await prisma.hostingRequest.findUnique({
    where: { id: requestId },
    include: hostingRequestInclude,
  });

  return request ? serializeHostingRequest(request) : null;
};

export const createHostingRequest = async (studentId: number, payload: HostingRequestPayload) => {
  const created = await prisma.$transaction(async (tx) => {
    const request = await tx.hostingRequest.create({
      data: {
        studentId,
        projectName: payload.projectName.trim(),
        projectDescription: payload.projectDescription.trim(),
        githubUrl: payload.githubUrl.trim(),
        projectCategory: payload.projectCategory.trim(),
        techStack: payload.techStack,
        databaseRequired: payload.databaseRequired,
        databaseType: payload.databaseRequired ? payload.databaseType : 'NONE',
        preferredSubdomain: payload.preferredSubdomain.trim().toLowerCase(),
        teamMembers: normalizeOptional(payload.teamMembers),
        facultyMentor: normalizeOptional(payload.facultyMentor),
        hostingDuration: normalizeOptional(payload.hostingDuration),
        additionalNotes: normalizeOptional(payload.additionalNotes),
      },
      include: hostingRequestInclude,
    });

    await tx.hostingRequestStatusHistory.create({
      data: {
        hostingRequestId: request.id,
        oldStatus: 'PENDING',
        newStatus: 'PENDING',
        remarks: 'Hosting request submitted.',
        changedById: studentId,
      },
    });

    return request;
  });

  const requestUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/project-hosting`;

  await createNotifications([
    {
      userId: studentId,
      type: 'HOSTING_REQUEST',
      title: 'Hosting request submitted',
      body: `${created.projectName} is now in ${formatStatus(created.status).toLowerCase()}.`,
    },
  ]);

  try {
    await sendHostingRequestSubmittedEmail(created.student.email, {
      studentName: created.student.name,
      projectName: created.projectName,
      requestId: created.id,
      requestUrl,
      preferredSubdomain: created.preferredSubdomain,
    });
  } catch (error) {
    console.error('Hosting request submission email failed:', error);
  }

  return serializeHostingRequest(created);
};

export const updateHostingRequestByStudent = async (
  requestId: number,
  studentId: number,
  payload: HostingRequestPayload
) => {
  const existing = await prisma.hostingRequest.findUnique({
    where: { id: requestId },
    include: hostingRequestInclude,
  });

  if (!existing || existing.studentId !== studentId) {
    throw new Error('Hosting request not found.');
  }

  if (existing.status !== 'CHANGES_REQUESTED') {
    throw new Error('Only requests marked for changes can be edited.');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const request = await tx.hostingRequest.update({
      where: { id: requestId },
      data: {
        projectName: payload.projectName.trim(),
        projectDescription: payload.projectDescription.trim(),
        githubUrl: payload.githubUrl.trim(),
        projectCategory: payload.projectCategory.trim(),
        techStack: payload.techStack,
        databaseRequired: payload.databaseRequired,
        databaseType: payload.databaseRequired ? payload.databaseType : 'NONE',
        preferredSubdomain: payload.preferredSubdomain.trim().toLowerCase(),
        teamMembers: normalizeOptional(payload.teamMembers),
        facultyMentor: normalizeOptional(payload.facultyMentor),
        hostingDuration: normalizeOptional(payload.hostingDuration),
        additionalNotes: normalizeOptional(payload.additionalNotes),
        status: 'PENDING',
        reviewedById: null,
        reviewedAt: null,
        deploymentStatus: null,
        coolifyProjectId: null,
        assignedDatabaseCredentials: Prisma.JsonNull,
        hostingExpiryDate: null,
      },
      include: hostingRequestInclude,
    });

    await tx.hostingRequestStatusHistory.create({
      data: {
        hostingRequestId: request.id,
        oldStatus: existing.status,
        newStatus: 'PENDING',
        remarks: 'Student resubmitted the hosting request after requested changes.',
        changedById: studentId,
      },
    });

    return request;
  });

  await createNotifications([
    {
      userId: studentId,
      type: 'HOSTING_REQUEST',
      title: 'Hosting request resubmitted',
      body: `${updated.projectName} has been moved back to pending review.`,
    },
  ]);

  return serializeHostingRequest(updated);
};

export const reviewHostingRequest = async (
  requestId: number,
  reviewerId: number,
  payload: HostingReviewPayload
) => {
  const existing = await prisma.hostingRequest.findUnique({
    where: { id: requestId },
    include: hostingRequestInclude,
  });

  if (!existing) {
    throw new Error('Hosting request not found.');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const request = await tx.hostingRequest.update({
      where: { id: requestId },
      data: {
        status: payload.status,
        adminRemarks: payload.adminRemarks.trim(),
        assignedDomain:
          payload.status === 'APPROVED' ? normalizeOptional(payload.assignedDomain)?.toLowerCase() ?? null : null,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        deploymentStatus: normalizeOptional(payload.deploymentStatus),
        coolifyProjectId: normalizeOptional(payload.coolifyProjectId),
        assignedDatabaseCredentials: payload.assignedDatabaseCredentials
          ? (payload.assignedDatabaseCredentials as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        hostingExpiryDate: payload.hostingExpiryDate ? new Date(payload.hostingExpiryDate) : null,
      },
      include: hostingRequestInclude,
    });

    await tx.hostingRequestStatusHistory.create({
      data: {
        hostingRequestId: request.id,
        oldStatus: existing.status,
        newStatus: payload.status,
        remarks: payload.adminRemarks.trim(),
        changedById: reviewerId,
      },
    });

    return request;
  });

  await createNotifications([
    {
      userId: updated.studentId,
      type: 'HOSTING_REQUEST',
      title: `Hosting request ${formatStatus(payload.status).toLowerCase()}`,
      body:
        payload.status === 'APPROVED'
          ? `${updated.projectName} was approved${updated.assignedDomain ? ` and assigned ${updated.assignedDomain}` : ''}.`
          : `${updated.projectName}: ${payload.adminRemarks.trim()}`,
    },
  ]);

  const requestUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/project-hosting`;

  try {
    if (payload.status === 'APPROVED') {
      await sendHostingRequestApprovedEmail(updated.student.email, {
        studentName: updated.student.name,
        projectName: updated.projectName,
        requestId: updated.id,
        requestUrl,
        assignedDomain: updated.assignedDomain,
        adminRemarks: updated.adminRemarks,
      });
    } else if (payload.status === 'REJECTED') {
      await sendHostingRequestRejectedEmail(updated.student.email, {
        studentName: updated.student.name,
        projectName: updated.projectName,
        requestId: updated.id,
        requestUrl,
        adminRemarks: updated.adminRemarks,
      });
    } else if (payload.status === 'CHANGES_REQUESTED') {
      await sendHostingRequestChangesRequestedEmail(updated.student.email, {
        studentName: updated.student.name,
        projectName: updated.projectName,
        requestId: updated.id,
        requestUrl,
        adminRemarks: updated.adminRemarks,
      });
    }
  } catch (error) {
    console.error('Hosting request review email failed:', error);
  }

  return serializeHostingRequest(updated);
};

export const hostingRequestIncludeConfig = hostingRequestInclude;
