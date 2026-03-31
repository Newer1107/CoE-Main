import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { z } from 'zod';

const questionSchema = z.object({
  questionText: z.string().trim().min(5, 'Question must be at least 5 characters'),
  type: z.enum(['TEXT', 'LONG_TEXT']).default('TEXT'),
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
    if (!authorize(user, 'FACULTY', 'ADMIN')) return errorRes('Forbidden', ['Faculty or admin access required'], 403);

    const params = await context.params;
    const problemId = Number(params.id);

    if (!Number.isInteger(problemId) || problemId <= 0) {
      return errorRes('Invalid problem ID', ['Problem ID must be a positive integer'], 400);
    }

    const body = await req.json();
    const parsed = questionSchema.safeParse(body);

    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
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

    const question = await prisma.problemQuestion.create({
      data: {
        problemId,
        questionText: parsed.data.questionText,
        type: parsed.data.type,
      },
    });

    return successRes(question, 'Question created successfully.', 201);
  } catch (err) {
    console.error('Problem questions POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
