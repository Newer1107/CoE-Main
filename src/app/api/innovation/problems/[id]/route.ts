import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationProblemUpdateSchema } from '@/lib/validators';
import { getSignedUrl, uploadFileWithObjectKey } from '@/lib/minio';
import { sanitizeFilename } from '@/lib/innovation';

const parseBooleanLike = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'on'].includes(normalized);
  }
  return false;
};

// PATCH /api/innovation/problems/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'FACULTY', 'ADMIN', 'INDUSTRY_PARTNER')) {
      return errorRes('Forbidden', ['Faculty, industry partner, or admin access required'], 403);
    }

    const { id } = await params;
    const problemId = Number(id);
    if (!Number.isInteger(problemId) || problemId <= 0) return errorRes('Invalid problem id', [], 400);

    const existing = await prisma.problem.findUnique({ where: { id: problemId } });
    if (!existing) return errorRes('Problem not found', [], 404);

    const currentUserRecord = await prisma.user.findUnique({
      where: { id: user.id },
      select: { industryId: true },
    });
    const requesterIndustryId = currentUserRecord?.industryId ?? null;

    if (existing.eventId && !authorize(user, 'ADMIN')) {
      return errorRes('Forbidden', ['Only admin can manage hackathon event problem statements'], 403);
    }

    if (!authorize(user, 'ADMIN')) {
      if (existing.problemType === 'INTERNSHIP') {
        if (!authorize(user, 'INDUSTRY_PARTNER')) {
          return errorRes('Forbidden', ['Only admin or industry partner users can modify internship problems'], 403);
        }

        if (!requesterIndustryId || !existing.industryId || requesterIndustryId !== existing.industryId) {
          return errorRes('Forbidden', ['You can only modify internship problems owned by your industry'], 403);
        }
      } else if (existing.createdById !== user.id) {
        return errorRes('Forbidden', ['You can only modify your own problems'], 403);
      }
    }

    const contentType = req.headers.get('content-type') || '';
    let body: Record<string, unknown> = {};
    let supportDocumentFile: File | null = null;
    let removeSupportDocument = false;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();

      const titleRaw = formData.get('title');
      const descriptionRaw = formData.get('description');
      const tagsRaw = formData.get('tags');
      const modeRaw = formData.get('mode');
      const statusRaw = formData.get('status');
      const problemTypeRaw = formData.get('problemType');
      const approvalStatusRaw = formData.get('approvalStatus');
      const isIndustryProblemRaw = formData.get('isIndustryProblem');
      const industryNameRaw = formData.get('industryName');
      const removeSupportDocumentRaw = formData.get('removeSupportDocument');

      body = {
        ...(titleRaw !== null ? { title: String(titleRaw).trim() } : {}),
        ...(descriptionRaw !== null ? { description: String(descriptionRaw).trim() } : {}),
        ...(tagsRaw !== null ? { tags: String(tagsRaw).trim() } : {}),
        ...(modeRaw !== null ? { mode: String(modeRaw).trim().toUpperCase() } : {}),
        ...(statusRaw !== null ? { status: String(statusRaw).trim().toUpperCase() } : {}),
        ...(problemTypeRaw !== null ? { problemType: String(problemTypeRaw).trim().toUpperCase() } : {}),
        ...(approvalStatusRaw !== null ? { approvalStatus: String(approvalStatusRaw).trim().toUpperCase() } : {}),
        ...(isIndustryProblemRaw !== null ? { isIndustryProblem: parseBooleanLike(isIndustryProblemRaw) } : {}),
        ...(industryNameRaw !== null ? { industryName: String(industryNameRaw).trim() } : {}),
      };

      removeSupportDocument = removeSupportDocumentRaw !== null ? parseBooleanLike(removeSupportDocumentRaw) : false;
      supportDocumentFile = formData.get('supportDocument') as File | null;
    } else {
      body = await req.json();
      removeSupportDocument = parseBooleanLike(body.removeSupportDocument);
    }

    const parsed = innovationProblemUpdateSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    if (existing.eventId && typeof parsed.data.mode !== 'undefined' && parsed.data.mode !== 'CLOSED') {
      return errorRes('Invalid mode update', ['Hackathon problem statements must remain CLOSED'], 400);
    }

    if (!existing.eventId && typeof parsed.data.mode !== 'undefined' && parsed.data.mode !== 'OPEN') {
      return errorRes('Invalid mode update', ['Open innovation problems must remain OPEN'], 400);
    }

    if (existing.problemType === 'INTERNSHIP' && typeof parsed.data.mode !== 'undefined' && parsed.data.mode !== 'OPEN') {
      return errorRes('Invalid mode update', ['Internship opportunities must remain OPEN mode'], 400);
    }

    if (existing.eventId && typeof parsed.data.status !== 'undefined' && parsed.data.status === 'OPENED') {
      return errorRes('Invalid status update', ['Hackathon problem statements cannot be marked OPENED'], 400);
    }

    if (typeof parsed.data.approvalStatus !== 'undefined' && !authorize(user, 'ADMIN')) {
      return errorRes('Forbidden', ['Only admin can change problem approval status'], 403);
    }

    if (typeof parsed.data.problemType !== 'undefined' && parsed.data.problemType !== existing.problemType) {
      return errorRes('Invalid problemType update', ['Problem type cannot be changed after creation'], 400);
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
    if (typeof parsed.data.approvalStatus !== 'undefined') updateData.approvalStatus = parsed.data.approvalStatus;

    if (supportDocumentFile) {
      if (supportDocumentFile.type !== 'application/pdf') {
        return errorRes('Invalid file type', ['Support document must be a PDF file'], 400);
      }

      const buffer = Buffer.from(await supportDocumentFile.arrayBuffer());
      const objectKey = existing.eventId
        ? `innovation/events/${existing.eventId}/problems/${existing.id}/support/${Date.now()}-${sanitizeFilename(supportDocumentFile.name)}`
        : `innovation/open-problems/${existing.id}/support/${Date.now()}-${sanitizeFilename(supportDocumentFile.name)}`;

      const supportDocumentKey = await uploadFileWithObjectKey(objectKey, {
        buffer,
        mimetype: supportDocumentFile.type,
        size: buffer.length,
      });

      updateData.supportDocumentKey = supportDocumentKey;
    } else if (removeSupportDocument) {
      updateData.supportDocumentKey = null;
    }

    const problem = await prisma.problem.update({
      where: { id: problemId },
      data: updateData,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        event: { select: { id: true, title: true, status: true } },
        _count: { select: { claims: true, applications: true } },
      },
    });

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
