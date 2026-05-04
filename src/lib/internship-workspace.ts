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

export const resolveInternshipAccess = async (user: TokenPayload, internshipId: number) => {
  if (user.role === 'ADMIN') {
    const internship = await prisma.internship.findUnique({ where: { id: internshipId } });
    if (!internship) {
      throw new InternshipWorkspaceError('Internship not found', 404, ['Internship does not exist']);
    }
    return { internship, role: 'ADMIN' as InternshipAccessRole };
  }

  if (user.role === 'INDUSTRY_PARTNER') {
    const internship = await prisma.internship.findFirst({
      where: { id: internshipId, industryPartnerId: user.id },
    });
    if (!internship) {
      throw new InternshipWorkspaceError('Forbidden', 403, ['Access to this internship is restricted']);
    }
    return { internship, role: 'INDUSTRY' as InternshipAccessRole };
  }

  if (user.role === 'STUDENT') {
    const participant = await prisma.internshipParticipant.findFirst({
      where: { internshipId, studentId: user.id },
      include: { internship: true },
    });
    if (!participant) {
      throw new InternshipWorkspaceError('Forbidden', 403, ['Access to this internship is restricted']);
    }
    return { internship: participant.internship, role: 'STUDENT' as InternshipAccessRole };
  }

  throw new InternshipWorkspaceError('Forbidden', 403, ['Access to this internship is restricted']);
};

export const requireIndustryAccess = async (user: TokenPayload, internshipId: number) => {
  const { internship, role } = await resolveInternshipAccess(user, internshipId);
  if (role !== 'INDUSTRY' && role !== 'ADMIN') {
    throw new InternshipWorkspaceError('Forbidden', 403, ['Industry partner access required']);
  }
  return internship;
};

export const requireParticipantAccess = async (user: TokenPayload, internshipId: number) => {
  const { internship } = await resolveInternshipAccess(user, internshipId);
  return internship;
};
