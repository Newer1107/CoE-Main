import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { z } from 'zod';

const singleQuestionSchema = z.object({
  questionText: z.string().trim().min(5, 'Question must be at least 5 characters'),
  type: z.enum(['TEXT', 'LONG_TEXT']).default('TEXT'),
});

const batchQuestionSchema = z.object({
  questions: z
    .array(
      z.object({
        questionText: z.string().trim().min(5, 'Question must be at least 5 characters'),
        questionType: z.enum(['SHORT_TEXT', 'LONG_TEXT']).optional(),
        type: z.enum(['TEXT', 'LONG_TEXT']).optional(),
      })
    )
    .min(1, 'At least one question is required'),
});

// GET /api/innovation/problems/[id]/questions
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const problemId = Number(params.id);

    if (!Number.isInteger(problemId) || problemId <= 0) {
      return errorRes('Invalid problem ID', ['Problem ID must be a positive integer'], 400);
    }

    const problem = await prisma.problem.findFirst({
      where: {
        id: problemId,
        mode: 'OPEN',
        eventId: null,
        status: 'OPENED',
        approvalStatus: 'APPROVED',
        problemType: { in: ['OPEN', 'INTERNSHIP'] },
      },
      select: { id: true },
    });

    if (!problem) {
      return errorRes('Problem not found', ['Open problem not found or closed'], 404);
    }

    const questions = await prisma.problemQuestion.findMany({
      where: { problemId },
      orderBy: { createdAt: 'asc' },
    });

    return successRes(questions, 'Questions retrieved successfully.');
  } catch (err) {
    console.error('Problem questions GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// POST /api/innovation/problems/[id]/questions
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'FACULTY', 'INDUSTRY_PARTNER', 'ADMIN')) {
      return errorRes('Forbidden', ['Faculty, industry partner, or admin access required'], 403);
    }

    const params = await context.params;
    const problemId = Number(params.id);

    if (!Number.isInteger(problemId) || problemId <= 0) {
      return errorRes('Invalid problem ID', ['Problem ID must be a positive integer'], 400);
    }

    const body = await req.json();

    let questionsToCreate: Array<{ questionText: string; type: 'TEXT' | 'LONG_TEXT' }> = [];

    const parsedBatch = batchQuestionSchema.safeParse(body);
    if (parsedBatch.success) {
      questionsToCreate = parsedBatch.data.questions.map((q) => ({
        questionText: q.questionText.trim(),
        type: q.type ?? (q.questionType === 'LONG_TEXT' ? 'LONG_TEXT' : 'TEXT'),
      }));
    } else {
      const parsedSingle = singleQuestionSchema.safeParse(body);
      if (!parsedSingle.success) {
        return errorRes('Validation failed', parsedSingle.error.issues.map((issue) => issue.message), 400);
      }

      questionsToCreate = [
        {
          questionText: parsedSingle.data.questionText.trim(),
          type: parsedSingle.data.type,
        },
      ];
    }

    const problem = await prisma.problem.findFirst({
      where: {
        id: problemId,
        mode: 'OPEN',
        eventId: null,
      },
      select: {
        id: true,
        createdById: true,
      },
    });

    if (!problem) {
      return errorRes('Problem not found', ['Open problem not found'], 404);
    }

    // Check if user is faculty/admin or created this problem
    if (!authorize(user, 'ADMIN') && problem.createdById !== user.id) {
      return errorRes('Forbidden', ['You can only add questions to your own problems'], 403);
    }

    const createdQuestions = await prisma.$transaction(
      questionsToCreate.map((q) =>
        prisma.problemQuestion.create({
          data: {
            problemId,
            questionText: q.questionText,
            type: q.type,
          },
        })
      )
    );

    return successRes(
      createdQuestions.length === 1 ? createdQuestions[0] : createdQuestions,
      createdQuestions.length === 1 ? 'Question created successfully.' : 'Questions created successfully.',
      201
    );
  } catch (err) {
    console.error('Problem questions POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
