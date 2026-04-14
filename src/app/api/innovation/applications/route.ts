import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { logActivity } from '@/lib/activity-log';
import { z } from 'zod';

const applicationSchema = z.object({
  problemId: z.number().int().positive('Problem ID must be a positive integer'),
  answers: z.array(
    z.object({
      questionId: z.number().int().positive('Question ID must be a positive integer'),
      answerText: z.string().trim().min(1, 'Answer cannot be empty'),
    })
  ),
});

// POST /api/innovation/applications
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);
    logActivity('INNOVATION_OPEN_APPLICATION_ATTEMPT', { userId: user.id });

    const body = await req.json();
    const parsed = applicationSchema.safeParse(body);

    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    // Get student profile
    const profile = await prisma.studentProfile.findUnique({
      where: { userId: user.id },
    });

    if (!profile) {
      logActivity('INNOVATION_OPEN_APPLICATION_REJECTED', {
        userId: user.id,
        reason: 'PROFILE_MISSING',
      });
      return errorRes('Profile not found', ['You must create a student profile before applying'], 404);
    }

    if (!profile.isComplete) {
      logActivity('INNOVATION_OPEN_APPLICATION_REJECTED', {
        userId: user.id,
        reason: 'PROFILE_INCOMPLETE',
      });
      return errorRes('Incomplete profile', ['Your profile must be complete (all fields + resume) before applying'], 400);
    }

    // Check if problem exists and is open
    const problem = await prisma.problem.findFirst({
      where: {
        id: parsed.data.problemId,
        mode: 'OPEN',
        eventId: null,
        status: 'OPENED',
        approvalStatus: 'APPROVED',
        problemType: { in: ['OPEN', 'INTERNSHIP'] },
      },
      select: { id: true },
    });

    if (!problem) {
      logActivity('INNOVATION_OPEN_APPLICATION_REJECTED', {
        userId: user.id,
        problemId: parsed.data.problemId,
        reason: 'PROBLEM_NOT_OPEN',
      });
      return errorRes('Problem not found', ['Open problem not found or closed for applications'], 404);
    }

    // Check for duplicate application
    const existingApplication = await prisma.application.findUnique({
      where: {
        userId_problemId: {
          userId: user.id,
          problemId: parsed.data.problemId,
        },
      },
    });

    if (existingApplication) {
      logActivity('INNOVATION_OPEN_APPLICATION_REJECTED', {
        userId: user.id,
        problemId: parsed.data.problemId,
        reason: 'DUPLICATE_APPLICATION',
      });
      return errorRes('Duplicate application', ['You have already applied to this problem'], 400);
    }

    // Verify all questions belong to this problem and exist
    const questionIds = parsed.data.answers.map((a) => a.questionId);
    const questions = await prisma.problemQuestion.findMany({
      where: {
        id: { in: questionIds },
        problemId: parsed.data.problemId,
      },
      select: { id: true },
    });

    if (questions.length !== questionIds.length) {
      return errorRes(
        'Invalid questions',
        ['Some questions do not belong to this problem or do not exist'],
        400
      );
    }

    // Verify all required questions are answered
    const allQuestions = await prisma.problemQuestion.findMany({
      where: { problemId: parsed.data.problemId },
      select: { id: true },
    });

    if (allQuestions.length !== parsed.data.answers.length) {
      return errorRes('Incomplete answers', ['All questions must be answered'], 400);
    }

    // Create application with answers
    const application = await prisma.application.create({
      data: {
        userId: user.id,
        profileId: profile.id,
        problemId: parsed.data.problemId,
        status: 'SUBMITTED',
        answers: {
          create: parsed.data.answers.map((answer) => ({
            questionId: answer.questionId,
            answerText: answer.answerText,
          })),
        },
      },
      include: {
        problem: { select: { id: true, title: true } },
        answers: {
          include: { question: { select: { id: true, questionText: true } } },
        },
      },
    });

    logActivity('INNOVATION_OPEN_APPLICATION_SUBMITTED', {
      userId: user.id,
      applicationId: application.id,
      problemId: parsed.data.problemId,
      answerCount: parsed.data.answers.length,
    });

    return successRes(application, 'Application submitted successfully.', 201);
  } catch (err) {
    console.error('Applications POST error:', err);
    logActivity('INNOVATION_OPEN_APPLICATION_ERROR', {
      error: err instanceof Error ? err.message : 'UNKNOWN_ERROR',
    });
    return errorRes('Internal server error', [], 500);
  }
}

// GET /api/innovation/applications/my
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const applications = await prisma.application.findMany({
      where: { userId: user.id },
      include: {
        problem: { select: { id: true, title: true } },
        profile: { select: { skills: true, experience: true, interests: true } },
        answers: {
          include: { question: { select: { id: true, questionText: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return successRes(applications, 'Applications retrieved successfully.');
  } catch (err) {
    console.error('Applications GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
