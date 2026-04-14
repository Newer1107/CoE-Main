import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { getStoredFileDisplayName } from '@/lib/innovation';
import { z } from 'zod';
import { getSignedUrl } from '@/lib/minio';
import { sendApplicationSelectionEmail, sendApplicationRejectionEmail } from '@/lib/mailer';

const reviewSchema = z.object({
  status: z.enum(['SUBMITTED', 'SELECTED', 'REJECTED']),
  feedback: z.string().trim().optional(),
});

// PATCH /api/innovation/faculty/applications/[id]/review
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'FACULTY', 'INDUSTRY_PARTNER', 'ADMIN')) {
      return errorRes('Forbidden', ['Faculty, industry partner, or admin access required'], 403);
    }

    const params = await context.params;
    const applicationId = Number(params.id);

    if (!Number.isInteger(applicationId) || applicationId <= 0) {
      return errorRes('Invalid application ID', ['Application ID must be a positive integer'], 400);
    }

    const body = await req.json();
    const parsed = reviewSchema.safeParse(body);

    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { problem: { select: { createdById: true, problemType: true, industryId: true } } },
    });

    if (!application) {
      return errorRes('Application not found', ['Application does not exist'], 404);
    }

    const requester = await prisma.user.findUnique({
      where: { id: user.id },
      select: { industryId: true },
    });

    if (!authorize(user, 'ADMIN')) {
      if (application.problem.problemType === 'INTERNSHIP') {
        if (user.role !== 'INDUSTRY_PARTNER') {
          return errorRes('Forbidden', ['Only industry partner users can review internship applications'], 403);
        }

        if (!requester?.industryId || !application.problem.industryId || requester.industryId !== application.problem.industryId) {
          return errorRes('Forbidden', ['You can only review applications for your industry opportunities'], 403);
        }
      } else if (application.problem.createdById !== user.id) {
        return errorRes(
          'Forbidden',
          ['You can only review applications for your own problems'],
          403
        );
      }
    }

    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: parsed.data.status,
        feedback: parsed.data.feedback || null,
        updatedAt: new Date(),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        problem: { select: { id: true, title: true } },
        profile: { select: { skills: true, experience: true, interests: true, resumeUrl: true } },
        answers: {
          include: { question: { select: { id: true, questionText: true } } },
        },
      },
    });

    // Send notification email based on status
    try {
      if (parsed.data.status === 'SELECTED') {
        await sendApplicationSelectionEmail(updated.user.email, {
          studentName: updated.user.name,
          problemTitle: updated.problem.title,
          feedback: parsed.data.feedback,
        });
      } else if (parsed.data.status === 'REJECTED') {
        await sendApplicationRejectionEmail(updated.user.email, {
          studentName: updated.user.name,
          problemTitle: updated.problem.title,
          feedback: parsed.data.feedback,
        });
      }
    } catch (emailErr) {
      console.error(
        `Failed to send application notification email for application ${applicationId}:`,
        emailErr
      );
      // Don't fail the request if email fails — the update already succeeded
    }

    const payload = {
      ...updated,
      profile: {
        ...updated.profile,
        resumeFileName: getStoredFileDisplayName(updated.profile.resumeUrl),
        resumeUrl: updated.profile.resumeUrl ? await getSignedUrl(updated.profile.resumeUrl).catch(() => null) : null,
      },
    };

    return successRes(payload, 'Application review submitted successfully.');
  } catch (err) {
    console.error('Faculty applications review PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
