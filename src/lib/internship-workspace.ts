import prisma from '@/lib/prisma';
import type { TokenPayload } from '@/lib/jwt';

export type InternshipAccessRole = 'ADMIN' | 'INDUSTRY' | 'STUDENT';

export class InternshipWorkspaceError extends Error {
  status: number;
  details: string[];

  constructor(message: string, status = 400, details: string[] = []) {
    super(message);
    this.name = 'InternshipWorkspaceError';
    this.status = status;
    this.details = details;
  }
}

export const resolveInternshipAccess = async (user: TokenPayload, problemId: number) => {
  if (user.role === 'ADMIN') {
    const problem = await prisma.problem.findFirst({
      where: { id: problemId, problemType: 'INTERNSHIP' },
    });
    if (!problem) {
      throw new InternshipWorkspaceError('Internship not found', 404, ['Internship problem does not exist']);
    }
    return { problem, role: 'ADMIN' as InternshipAccessRole };
  }

  if (user.role === 'INDUSTRY_PARTNER') {
    const industryId = typeof user.industryId === 'number' ? user.industryId : null;
    const problem = await prisma.problem.findFirst({
      where: {
        id: problemId,
        problemType: 'INTERNSHIP',
        OR: [
          ...(industryId ? [{ industryId }] : []),
          { createdById: user.id },
        ],
      },
    });
    if (!problem) {
      throw new InternshipWorkspaceError('Forbidden', 403, ['Access to this internship is restricted']);
    }
    return { problem, role: 'INDUSTRY' as InternshipAccessRole };
  }

  if (user.role === 'STUDENT') {
    const application = await prisma.application.findFirst({
      where: {
        problemId,
        userId: user.id,
        status: 'SELECTED',
      },
      include: { problem: true },
    });
    if (!application) {
      throw new InternshipWorkspaceError('Forbidden', 403, ['Access to this internship is restricted']);
    }
    return { problem: application.problem, role: 'STUDENT' as InternshipAccessRole };
  }

  throw new InternshipWorkspaceError('Forbidden', 403, ['Access to this internship is restricted']);
};

export const requireIndustryAccess = async (user: TokenPayload, problemId: number) => {
  const { problem, role } = await resolveInternshipAccess(user, problemId);
  if (role !== 'INDUSTRY' && role !== 'ADMIN') {
    throw new InternshipWorkspaceError('Forbidden', 403, ['Industry partner access required']);
  }
  return problem;
};

export const requireParticipantAccess = async (user: TokenPayload, problemId: number) => {
  const { problem } = await resolveInternshipAccess(user, problemId);
  return problem;
};
