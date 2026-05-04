import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { resolveInternshipAccess, InternshipWorkspaceError } from '@/lib/internship-workspace';

const querySchema = z.object({
  id: z.coerce.number().int().positive().optional(),
});

// GET /api/internships
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    if (parsed.data.id) {
      const access = await resolveInternshipAccess(user, parsed.data.id);
      const internship = await prisma.internship.findUnique({
        where: { id: access.internship.id },
        include: {
          industryPartner: { select: { id: true, name: true, email: true } },
          participants: { include: { student: { select: { id: true, name: true, email: true } } } },
        },
      });

      if (!internship) return errorRes('Internship not found', [], 404);

      return successRes(internship, 'Internship retrieved successfully.');
    }

    if (user.role === 'ADMIN') {
      const internships = await prisma.internship.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          industryPartner: { select: { id: true, name: true, email: true } },
          participants: { include: { student: { select: { id: true, name: true, email: true } } } },
        },
      });
      return successRes(internships, 'Internships retrieved successfully.');
    }

    if (user.role === 'INDUSTRY_PARTNER') {
      const internships = await prisma.internship.findMany({
        where: { industryPartnerId: user.id },
        orderBy: { createdAt: 'desc' },
        include: {
          participants: { include: { student: { select: { id: true, name: true, email: true } } } },
        },
      });
      return successRes(internships, 'Internships retrieved successfully.');
    }

    const internships = await prisma.internship.findMany({
      where: { participants: { some: { studentId: user.id } } },
      orderBy: { createdAt: 'desc' },
      include: {
        industryPartner: { select: { id: true, name: true, email: true } },
        participants: { include: { student: { select: { id: true, name: true, email: true } } } },
      },
    });
    return successRes(internships, 'Internships retrieved successfully.');
  } catch (err) {
    if (err instanceof InternshipWorkspaceError) {
      return errorRes(err.message, err.details, err.status);
    }
    console.error('Internships GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
