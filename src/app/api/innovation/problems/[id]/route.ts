import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationProblemUpdateSchema } from '@/lib/validators';
import { getSignedUrl } from '@/lib/minio';
import { sendInnovationClaimReviewEmail } from '@/lib/mailer';

// PATCH /api/innovation/problems/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'FACULTY', 'ADMIN')) return errorRes('Forbidden', ['Faculty or admin access required'], 403);

    const { id } = await params;
    const problemId = Number(id);
    if (!Number.isInteger(problemId) || problemId <= 0) return errorRes('Invalid problem id', [], 400);

    const existing = await prisma.problem.findUnique({ where: { id: problemId } });
    if (!existing) return errorRes('Problem not found', [], 404);

    if (!authorize(user, 'ADMIN') && existing.createdById !== user.id) {
      return errorRes('Forbidden', ['You can only modify your own problems'], 403);
    }

    const body = await req.json();
    const parsed = innovationProblemUpdateSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    if (existing.eventId && typeof parsed.data.mode !== 'undefined' && parsed.data.mode !== 'CLOSED') {
      return errorRes('Invalid mode update', ['Hackathon problem statements must remain CLOSED'], 400);
    }

    if (!existing.eventId && typeof parsed.data.mode !== 'undefined' && parsed.data.mode !== 'OPEN') {
      return errorRes('Invalid mode update', ['Open innovation problems must remain OPEN'], 400);
    }

    if (existing.eventId && typeof parsed.data.status !== 'undefined' && parsed.data.status === 'OPENED') {
      return errorRes('Invalid status update', ['Hackathon problem statements cannot be marked OPENED'], 400);
    }

    const targetIsIndustryProblem =
      typeof parsed.data.isIndustryProblem === 'boolean' ? parsed.data.isIndustryProblem : existing.isIndustryProblem;
    const hasIndustryNameInPayload = Object.prototype.hasOwnProperty.call(parsed.data, 'industryName');
    const requestedIndustryName =
      typeof parsed.data.industryName === 'string' ? parsed.data.industryName.trim() : undefined;

    let normalizedIndustryName: string | null | undefined;
    if (targetIsIndustryProblem) {
      if (hasIndustryNameInPayload) {
        if (!requestedIndustryName || requestedIndustryName.length < 2) {
          return errorRes('Validation failed', ['Industry name is required for industry problems'], 400);
        }
        normalizedIndustryName = requestedIndustryName;
      } else {
        normalizedIndustryName = existing.industryName;
      }
    } else {
      if (requestedIndustryName && requestedIndustryName.length > 0) {
        return errorRes('Validation failed', ['Industry name is only allowed when the problem type is industry'], 400);
      }
      normalizedIndustryName = null;
    }

    const updateData: Record<string, unknown> = {
      tags: parsed.data.tags === '' ? null : parsed.data.tags,
      industryName: normalizedIndustryName,
    };

    if (typeof parsed.data.title !== 'undefined') updateData.title = parsed.data.title;
    if (typeof parsed.data.description !== 'undefined') updateData.description = parsed.data.description;
    if (typeof parsed.data.mode !== 'undefined') updateData.mode = parsed.data.mode;
    if (typeof parsed.data.status !== 'undefined') updateData.status = parsed.data.status;
    if (typeof parsed.data.isIndustryProblem !== 'undefined') updateData.isIndustryProblem = parsed.data.isIndustryProblem;

    const shouldPublishOpenResults =
      !existing.eventId &&
      existing.mode === 'OPEN' &&
      existing.status !== 'CLOSED' &&
      parsed.data.status === 'CLOSED';

    const publishTimestamp = new Date();

    const { problem, submissionsToPublish } = await prisma.$transaction(async (tx) => {
      const updatedProblem = await tx.problem.update({
        where: { id: problemId },
        data: updateData,
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          event: { select: { id: true, title: true, status: true } },
          _count: { select: { claims: true, openSubmissions: true } },
        },
      });

      if (!shouldPublishOpenResults) {
        return {
          problem: updatedProblem,
          submissionsToPublish: [] as Array<{
            id: number;
            status: 'IN_PROGRESS' | 'SUBMITTED' | 'SHORTLISTED' | 'ACCEPTED' | 'REVISION_REQUESTED' | 'REJECTED';
            score: number | null;
            feedback: string | null;
            members: Array<{ user: { email: string } }>;
          }>,
        };
      }

      const pendingReleaseSubmissions = await tx.openSubmission.findMany({
        where: {
          problemId,
          resultPublishedAt: null,
        },
        select: {
          id: true,
          status: true,
          score: true,
          feedback: true,
          members: {
            select: {
              user: {
                select: { email: true },
              },
            },
          },
        },
      });

      if (pendingReleaseSubmissions.length > 0) {
        await tx.openSubmission.updateMany({
          where: { id: { in: pendingReleaseSubmissions.map((submission) => submission.id) } },
          data: { resultPublishedAt: publishTimestamp },
        });
      }

      return {
        problem: updatedProblem,
        submissionsToPublish: pendingReleaseSubmissions,
      };
    });

    for (const submission of submissionsToPublish) {
      if (!['ACCEPTED', 'REVISION_REQUESTED', 'REJECTED'].includes(submission.status)) continue;

      const recipientEmails = Array.from(new Set(submission.members.map((member) => member.user.email)));
      if (recipientEmails.length === 0) continue;

      try {
        await sendInnovationClaimReviewEmail(recipientEmails, {
          problemTitle: problem.title,
          status: submission.status as 'ACCEPTED' | 'REVISION_REQUESTED' | 'REJECTED',
          score: submission.score,
          feedback: submission.feedback,
        });
      } catch (mailErr) {
        console.error(`Open statement result email failed for submission #${submission.id}:`, mailErr);
      }
    }

    const payload = {
      ...problem,
      supportDocumentUrl: problem.supportDocumentKey ? await getSignedUrl(problem.supportDocumentKey).catch(() => null) : null,
    };

    return successRes(payload, 'Problem updated successfully.');
  } catch (err) {
    console.error('Innovation problems PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// DELETE /api/innovation/problems/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { id } = await params;
    const problemId = Number(id);
    if (!Number.isInteger(problemId) || problemId <= 0) return errorRes('Invalid problem id', [], 400);

    const existing = await prisma.problem.findUnique({ where: { id: problemId } });
    if (!existing) return errorRes('Problem not found', [], 404);

    await prisma.problem.delete({ where: { id: problemId } });
    return successRes(null, 'Problem deleted successfully.');
  } catch (err) {
    console.error('Innovation problems DELETE error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
