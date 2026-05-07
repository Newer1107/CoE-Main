import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';

const bodySchema = z.object({
  problemId: z.coerce.number().int().positive().optional(),
  problemTitle: z.string().trim().min(1).optional(),
  studentEmail: z.string().trim().min(3),
});

// POST /api/internships/add-participant
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'INDUSTRY_PARTNER', 'ADMIN')) {
      return errorRes('Forbidden', ['Industry partner or admin access required'], 403);
    }

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((i) => i.message), 400);

    const { problemId, problemTitle, studentEmail } = parsed.data;

    if (typeof problemId !== 'number' && !problemTitle) {
      return errorRes('Validation failed', ['problemId or problemTitle is required'], 400);
    }

    // find student
    const student = await prisma.user.findFirst({ where: { email: studentEmail } });
    if (!student) return errorRes('Student not found', [], 404);

    return await prisma.$transaction(async (tx) => {
      let problem = null;

      if (typeof problemId === 'number') {
        problem = await tx.problem.findUnique({ where: { id: problemId } });
      } else if (problemTitle) {
        const userRec = user.role === 'INDUSTRY_PARTNER'
          ? await tx.user.findUnique({ where: { id: user.id }, select: { industryId: true } })
          : null;
        problem = await tx.problem.findFirst({
          where: {
            title: problemTitle,
            problemType: 'INTERNSHIP',
            ...(user.role === 'INDUSTRY_PARTNER'
              ? {
                  OR: [
                    ...(userRec?.industryId ? [{ industryId: userRec.industryId }] : []),
                    { createdById: user.id },
                  ],
                }
              : {}),
          },
          orderBy: { createdAt: 'desc' },
        });
      }

      if (!problem) {
        throw new Error('Problem statement not found');
      }

      if (problem.problemType !== 'INTERNSHIP') {
        throw new Error('Problem statement not found');
      }

      if (user.role === 'INDUSTRY_PARTNER') {
        const userRec = await tx.user.findUnique({ where: { id: user.id }, select: { industryId: true } });
        if (
          (!userRec?.industryId || problem.industryId !== userRec.industryId) &&
          problem.createdById !== user.id
        ) {
          throw new Error('Forbidden');
        }
      }

      // ensure a StudentProfile exists for the student (Application.profileId is required)
      const studentProfile = await tx.studentProfile.upsert({
        where: { userId: student.id },
        update: {},
        create: { userId: student.id },
      });

      await tx.application.upsert({
        where: {
          userId_problemId: {
            userId: student.id,
            problemId: problem.id,
          },
        },
        update: { status: 'SELECTED' },
        create: {
          userId: student.id,
          profileId: studentProfile.id,
          problemId: problem.id,
          status: 'SELECTED',
        },
      });

      return successRes({ problemId: problem.id, studentId: student.id }, 'Participant added successfully');
    });
  } catch (err) {
    console.error('Add participant error:', err);
    if (err instanceof Error && err.message === 'Forbidden') {
      return errorRes('Forbidden', ['You are not allowed to add participants to this problem'], 403);
    }
    return errorRes('Internal server error', [], 500);
  }
}
