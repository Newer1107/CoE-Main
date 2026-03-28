import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationOpenSubmissionReviewSchema } from '@/lib/validators';
import { calculateWeightedHackathonScore } from '@/lib/hackathon-scoring';

// PATCH /api/innovation/faculty/open-submissions/[id]/review
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'FACULTY', 'ADMIN')) {
      return errorRes('Forbidden', ['Faculty or admin access required'], 403);
    }

    const { id } = await params;
    const submissionId = Number(id);
    if (!Number.isInteger(submissionId) || submissionId <= 0) {
      return errorRes('Invalid open submission id', [], 400);
    }

    const body = await req.json();
    const parsed = innovationOpenSubmissionReviewSchema.safeParse(body);
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    const submission = await prisma.openSubmission.findUnique({
      where: { id: submissionId },
      include: {
        problem: {
          select: {
            id: true,
            title: true,
            createdById: true,
          },
        },
        members: {
          include: {
            user: { select: { email: true } },
          },
        },
      },
    });

    if (!submission) return errorRes('Open submission not found', [], 404);

    if (!authorize(user, 'ADMIN') && submission.problem.createdById !== user.id) {
      return errorRes('Forbidden', ['You can only review submissions for your own open statements'], 403);
    }

    const rubrics = parsed.data.rubrics;
    const finalScore = rubrics ? calculateWeightedHackathonScore(rubrics) : null;

    const updated = await prisma.openSubmission.update({
      where: { id: submissionId },
      data: {
        status: parsed.data.status,
        innovationScore: rubrics?.innovation ?? null,
        technicalScore: rubrics?.technical ?? null,
        impactScore: rubrics?.impact ?? null,
        uxScore: rubrics?.ux ?? null,
        executionScore: rubrics?.execution ?? null,
        presentationScore: rubrics?.presentation ?? null,
        feasibilityScore: rubrics?.feasibility ?? null,
        finalScore,
        score: finalScore,
        feedback: parsed.data.feedback || null,
        badges: parsed.data.badges || null,
        resultPublishedAt: null,
      },
    });

    return successRes(updated, 'Open submission review saved. Results will be released when this statement is closed.');
  } catch (err) {
    console.error('Innovation faculty open submission review PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
