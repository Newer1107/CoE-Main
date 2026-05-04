import prisma from '@/lib/prisma';
import type { TokenPayload } from '@/lib/jwt';
import type { InternshipApplicationStatus, Prisma } from '@prisma/client';

export class DecisionEngineError extends Error {
  status: number;
  details: string[];

  constructor(message: string, status = 400, details: string[] = []) {
    super(message);
    this.name = 'DecisionEngineError';
    this.status = status;
    this.details = details;
  }
}

export interface InternshipApplicationsFilters {
  internshipTitle?: string;
  problemStatementId?: number;
  status?: InternshipApplicationStatus;
  search?: string;
  page: number;
  pageSize: number;
  includeTitles?: boolean;
  includeIds?: boolean;
}

export interface InternshipApplicationsPage {
  items: Array<{
    id: number;
    internshipTitle: string;
    problemStatementId: number | null;
    status: InternshipApplicationStatus;
    createdAt: Date;
    student: {
      id: number;
      name: string;
      email: string;
    };
  }>;
  total: number;
  page: number;
  pageSize: number;
  titles?: string[];
  matchingIds?: number[];
}

const isAdmin = (user: TokenPayload) => user.role === 'ADMIN';
const isIndustryPartner = (user: TokenPayload) => user.role === 'INDUSTRY_PARTNER';
const isFaculty = (user: TokenPayload) => user.role === 'FACULTY';

export const getInternshipApplications = async (
  filters: InternshipApplicationsFilters,
  user: TokenPayload
): Promise<InternshipApplicationsPage> => {
  if (!isAdmin(user) && !isIndustryPartner(user) && !isFaculty(user)) {
    throw new DecisionEngineError('Forbidden', 403, ['Faculty, industry partner, or admin access required']);
  }

  const baseWhere: Record<string, unknown> = {};
  if (!isAdmin(user) && isIndustryPartner(user)) {
    baseWhere.industryPartnerId = user.id;
  }

  const where: Record<string, unknown> = { ...baseWhere };
  if (filters.internshipTitle) {
    where.internshipTitle = filters.internshipTitle;
  }
  if (typeof filters.problemStatementId === 'number') {
    where.problemStatementId = filters.problemStatementId;
  }
  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.search) {
    where.student = {
      OR: [
        { name: { contains: filters.search } },
        { email: { contains: filters.search } },
      ],
    };
  }

  const [total, items] = await prisma.$transaction([
    prisma.internshipApplication.count({ where }),
    prisma.internshipApplication.findMany({
      where,
      include: {
        student: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
  ]);

  const response: InternshipApplicationsPage = {
    items,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
  };

  if (filters.includeTitles) {
    const titles = await prisma.internshipApplication.findMany({
      where: baseWhere,
      select: { internshipTitle: true },
      distinct: ['internshipTitle'],
      orderBy: { internshipTitle: 'asc' },
    });
    response.titles = titles.map((row) => row.internshipTitle);
  }

  if (filters.includeIds) {
    const matching = await prisma.internshipApplication.findMany({
      where,
      select: { id: true },
    });
    response.matchingIds = matching.map((row) => row.id);
  }

  return response;
};

export interface BulkAcceptInput {
  selectionMode: 'IDS' | 'FILTERED';
  applicationIds?: number[];
  filters?: {
    internshipTitle?: string;
    problemStatementId?: number;
    search?: string;
    status?: InternshipApplicationStatus;
  };
  internshipTitle?: string;
  problemStatementId?: number;
  user: TokenPayload;
}

export interface BulkAcceptResult {
  internshipId: number;
  acceptedCount: number;
  rejectedCount: number;
}

export const acceptBulkInternshipApplications = async (
  input: BulkAcceptInput
): Promise<BulkAcceptResult> => {
  if (!isAdmin(input.user) && !isIndustryPartner(input.user) && !isFaculty(input.user)) {
    throw new DecisionEngineError('Forbidden', 403, ['Faculty, industry partner, or admin access required']);
  }

  const resolveSelection = async (tx: Prisma.TransactionClient) => {
    if (input.selectionMode === 'FILTERED') {
      if (!input.filters) {
        throw new DecisionEngineError('Invalid selection', 400, ['Filters are required for filtered selection.']);
      }

      if (!input.filters.internshipTitle && typeof input.filters.problemStatementId !== 'number') {
        throw new DecisionEngineError(
          'Invalid selection',
          400,
          ['internshipTitle or problemStatementId is required for filtered selection.']
        );
      }

      if (input.filters.status && input.filters.status !== 'APPLIED') {
        throw new DecisionEngineError('Invalid selection', 400, ['Only APPLIED applications can be accepted.']);
      }

      const filteredWhere: Record<string, unknown> = {};
      if (!isAdmin(input.user) && isIndustryPartner(input.user)) {
        filteredWhere.industryPartnerId = input.user.id;
      }

      if (input.filters.internshipTitle) {
        filteredWhere.internshipTitle = input.filters.internshipTitle;
      }
      if (typeof input.filters.problemStatementId === 'number') {
        filteredWhere.problemStatementId = input.filters.problemStatementId;
      }
      filteredWhere.status = 'APPLIED';
      if (input.filters.search) {
        filteredWhere.student = {
          OR: [
            { name: { contains: input.filters.search } },
            { email: { contains: input.filters.search } },
          ],
        };
      }

      const selected = await tx.internshipApplication.findMany({
        where: filteredWhere,
        select: {
          id: true,
          studentId: true,
          industryPartnerId: true,
          internshipTitle: true,
          problemStatementId: true,
          status: true,
        },
      });

      if (selected.length === 0) {
        throw new DecisionEngineError('No applications selected', 400, ['No applications match the filters.']);
      }

      return selected;
    }

    const rawIds = input.applicationIds ?? [];
    const uniqueIds = Array.from(new Set(rawIds));
    if (uniqueIds.length === 0) {
      throw new DecisionEngineError('No applications selected', 400, ['Select at least one application.']);
    }
    if (uniqueIds.length !== rawIds.length) {
      throw new DecisionEngineError('Duplicate application IDs', 400, ['Remove duplicate selections and retry.']);
    }

    const selected = await tx.internshipApplication.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        studentId: true,
        industryPartnerId: true,
        internshipTitle: true,
        problemStatementId: true,
        status: true,
      },
    });

    if (selected.length !== uniqueIds.length) {
      throw new DecisionEngineError('Invalid selection', 404, ['One or more applications were not found.']);
    }

    return selected;
  };

  return prisma.$transaction(async (tx) => {
    const selected = await resolveSelection(tx);

    const titleSet = new Set(selected.map((row) => row.internshipTitle));
    if (titleSet.size !== 1) {
      throw new DecisionEngineError('Mixed internship titles', 400, ['Select applications from a single internship title.']);
    }

    const selectedTitle = selected[0].internshipTitle;
    if (input.internshipTitle && input.internshipTitle !== selectedTitle) {
      throw new DecisionEngineError('Internship mismatch', 400, ['Internship title does not match selection.']);
    }
    if (input.filters?.internshipTitle && input.filters.internshipTitle !== selectedTitle) {
      throw new DecisionEngineError('Internship mismatch', 400, ['Internship title does not match selection.']);
    }

    const partnerSet = new Set(selected.map((row) => row.industryPartnerId));
    if (partnerSet.size !== 1) {
      throw new DecisionEngineError('Mixed industry ownership', 400, ['Selected applications belong to different owners.']);
    }

    const ownerId = selected[0].industryPartnerId;
    if (!isAdmin(input.user) && ownerId !== input.user.id) {
      throw new DecisionEngineError('Forbidden', 403, ['You can only accept applications for your internships.']);
    }

    const problemSet = new Set(selected.map((row) => row.problemStatementId || null));
    if (problemSet.size !== 1) {
      throw new DecisionEngineError('Mixed problem statements', 400, ['Select applications from a single problem statement.']);
    }

    const selectedProblemId = selected[0].problemStatementId ?? null;
    if (typeof input.problemStatementId === 'number' && input.problemStatementId !== selectedProblemId) {
      throw new DecisionEngineError('Problem statement mismatch', 400, ['Problem statement does not match selection.']);
    }
    if (
      typeof input.filters?.problemStatementId === 'number' &&
      input.filters.problemStatementId !== selectedProblemId
    ) {
      throw new DecisionEngineError('Problem statement mismatch', 400, ['Problem statement does not match selection.']);
    }

    if (selected.some((row) => row.status !== 'APPLIED')) {
      throw new DecisionEngineError(
        'Invalid selection',
        409,
        ['Selected applications must all be in APPLIED status.']
      );
    }

    const allApplications = await tx.internshipApplication.findMany({
      where: {
        internshipTitle: selectedTitle,
        ...(selectedProblemId ? { problemStatementId: selectedProblemId } : {}),
        industryPartnerId: ownerId,
      },
      select: { id: true, status: true },
    });

    if (allApplications.some((row) => row.status !== 'APPLIED')) {
      throw new DecisionEngineError(
        'Applications already decided',
        409,
        ['One or more applications have already been accepted or rejected.']
      );
    }

    const acceptedCount = selected.length;
    const rejectedCount = allApplications.length - acceptedCount;

    const acceptedUpdate = await tx.internshipApplication.updateMany({
      where: { id: { in: selected.map((row) => row.id) }, status: 'APPLIED' },
      data: { status: 'ACCEPTED' },
    });

    if (acceptedUpdate.count !== acceptedCount) {
      throw new DecisionEngineError(
        'Concurrent update detected',
        409,
        ['Some applications were modified before acceptance completed.']
      );
    }

    const rejectedUpdate = await tx.internshipApplication.updateMany({
      where: {
        id: { notIn: selected.map((row) => row.id) },
        internshipTitle: selectedTitle,
        status: 'APPLIED',
        ...(selectedProblemId ? { problemStatementId: selectedProblemId } : {}),
        industryPartnerId: ownerId,
      },
      data: { status: 'REJECTED' },
    });

    if (rejectedUpdate.count !== rejectedCount) {
      throw new DecisionEngineError(
        'Concurrent update detected',
        409,
        ['Some applications were modified before rejection completed.']
      );
    }

    const existingInternship = await tx.internship.findFirst({
      where: {
        title: selectedTitle,
        industryPartnerId: ownerId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    if (existingInternship) {
      throw new DecisionEngineError(
        'Internship already created',
        409,
        ['An internship already exists for this title.']
      );
    }

    const internship = await tx.internship.create({
      data: {
        title: selectedTitle,
        industryPartnerId: ownerId,
        problemStatementId: selectedProblemId,
        status: 'ACTIVE',
      },
    });

    await tx.internshipParticipant.createMany({
      data: selected.map((row) => ({
        internshipId: internship.id,
        studentId: row.studentId,
      })),
      skipDuplicates: true,
    });

    return {
      internshipId: internship.id,
      acceptedCount,
      rejectedCount,
    };
  });
};
