import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationProblemCreateSchema } from '@/lib/validators';
import { getSignedUrl, uploadFileWithObjectKey } from '@/lib/minio';
import { sanitizeFilename } from '@/lib/innovation';

const getIndustryMembershipForUser = async (userId: number) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { industryId: true },
  });

  return user?.industryId ?? null;
};

// GET /api/innovation/problems
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    const canViewHackathonTracks = !!user && authorize(user, 'ADMIN');
    const { searchParams } = new URL(req.url);

    const eventIdRaw = searchParams.get('eventId');
    const statusRaw = searchParams.get('status');
    const tag = searchParams.get('tag');
    const trackRaw = (searchParams.get('track') || 'open').toLowerCase();
    const problemTypeRaw = (searchParams.get('problemType') || '').toUpperCase();
    const approvalStatusRaw = (searchParams.get('approvalStatus') || '').toUpperCase();
    const ownerOnlyRaw = (searchParams.get('ownerOnly') || '').toLowerCase();
    const visibilityRaw = (searchParams.get('visibility') || '').toLowerCase();

    if (!['open', 'hackathon', 'all'].includes(trackRaw)) {
      return errorRes('Invalid track filter', ['track must be one of: open, hackathon, all'], 400);
    }

    if (problemTypeRaw && !['OPEN', 'INTERNSHIP'].includes(problemTypeRaw)) {
      return errorRes('Invalid problemType filter', ['problemType must be one of: OPEN, INTERNSHIP'], 400);
    }

    if (approvalStatusRaw && !['PENDING_APPROVAL', 'APPROVED', 'REJECTED'].includes(approvalStatusRaw)) {
      return errorRes('Invalid approvalStatus filter', ['approvalStatus must be one of: PENDING_APPROVAL, APPROVED, REJECTED'], 400);
    }

    if (visibilityRaw && !['public', 'internal'].includes(visibilityRaw)) {
      return errorRes('Invalid visibility filter', ['visibility must be one of: public, internal'], 400);
    }

    if (!canViewHackathonTracks && trackRaw !== 'open') {
      return errorRes('Forbidden', ['Only admin can view hackathon or all tracks from this endpoint'], 403);
    }

    const where: Record<string, unknown> = {
      status: { not: 'ARCHIVED' },
      ...(canViewHackathonTracks ? {} : { mode: 'OPEN', eventId: null }),
    };

    if (problemTypeRaw) {
      where.problemType = problemTypeRaw;
    }

    if (approvalStatusRaw) {
      where.approvalStatus = approvalStatusRaw;
    }

    const ownerOnly = ownerOnlyRaw === '1' || ownerOnlyRaw === 'true';
    if (ownerOnly) {
      if (!user) return errorRes('Unauthorized', [], 401);
      if (!authorize(user, 'FACULTY', 'INDUSTRY_PARTNER', 'ADMIN')) {
        return errorRes('Forbidden', ['Only faculty, industry partner, or admin can use ownerOnly filter'], 403);
      }

      if (user.role === 'INDUSTRY_PARTNER') {
        const industryId = await getIndustryMembershipForUser(user.id);
        if (!industryId) {
          return errorRes('Forbidden', ['Industry partner account is not linked to an industry. Contact admin.'], 403);
        }
        where.industryId = industryId;
      } else if (!authorize(user, 'ADMIN')) {
        where.createdById = user.id;
      }
    }

    const isPublicVisibility = visibilityRaw === 'public';
    if (isPublicVisibility || !user || authorize(user, 'STUDENT')) {
      if (!approvalStatusRaw) where.approvalStatus = 'APPROVED';
      if (!statusRaw) where.status = 'OPENED';
    }

    if (eventIdRaw) {
      const eventId = Number(eventIdRaw);
      if (!Number.isInteger(eventId) || eventId <= 0) return errorRes('Invalid eventId filter', ['eventId must be a positive integer'], 400);
      where.eventId = eventId;
    } else if (trackRaw === 'open') {
      where.eventId = null;
      where.mode = 'OPEN';
    } else if (trackRaw === 'hackathon') {
      where.eventId = { not: null };
      where.mode = 'CLOSED';
    }

    if (statusRaw) {
      const normalized = statusRaw.toUpperCase();
      const allowed = ['OPENED', 'CLOSED', 'ARCHIVED'];
      if (!allowed.includes(normalized)) return errorRes('Invalid status filter', ['status must be a valid ProblemStatus'], 400);
      where.status = normalized;
    }

    if (tag) {
      where.tags = { contains: tag };
    }

    const problems = await prisma.problem.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        event: { select: { id: true, title: true, status: true } },
        _count: { select: { claims: true, applications: true } },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    const payload = await Promise.all(
      problems.map(async (problem) => ({
        ...problem,
        supportDocumentUrl: problem.supportDocumentKey ? await getSignedUrl(problem.supportDocumentKey).catch(() => null) : null,
      }))
    );

    return successRes(payload, 'Problems retrieved.');
  } catch (err) {
    console.error('Innovation problems GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// POST /api/innovation/problems
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'FACULTY', 'ADMIN', 'INDUSTRY_PARTNER')) {
      return errorRes('Forbidden', ['Faculty, industry partner, or admin access required'], 403);
    }

    const contentType = req.headers.get('content-type') || '';

    let body: Record<string, unknown> = {};
    let supportDocumentFile: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      body = {
        title: ((formData.get('title') as string) || '').trim(),
        description: ((formData.get('description') as string) || '').trim(),
        tags: ((formData.get('tags') as string) || '').trim(),
        mode: ((formData.get('mode') as string) || 'OPEN').trim().toUpperCase(),
        problemType: ((formData.get('problemType') as string) || 'OPEN').trim().toUpperCase(),
        approvalStatus: ((formData.get('approvalStatus') as string) || '').trim().toUpperCase() || undefined,
        eventId: (formData.get('eventId') as string) || undefined,
        isIndustryProblem: (formData.get('isIndustryProblem') as string) ?? undefined,
        industryName: ((formData.get('industryName') as string) || '').trim(),
        questions: (formData.get('questions') as string) || undefined,
      };
      supportDocumentFile = formData.get('supportDocument') as File | null;
    } else {
      body = await req.json();
    }

    const parsed = innovationProblemCreateSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const isIndustryPartner = user.role === 'INDUSTRY_PARTNER';
    const requestedProblemType = isIndustryPartner ? 'INTERNSHIP' : (parsed.data.problemType || 'OPEN');
    const requesterIndustryId = isIndustryPartner ? await getIndustryMembershipForUser(user.id) : null;

    if (isIndustryPartner && !requesterIndustryId) {
      return errorRes('Forbidden', ['Industry partner account is not linked to an industry. Contact admin.'], 403);
    }

    if (requestedProblemType === 'INTERNSHIP' && !isIndustryPartner) {
      return errorRes('Forbidden', ['Internship problems can only be created by industry partners'], 403);
    }

    if (isIndustryPartner && parsed.data.eventId) {
      return errorRes('Validation failed', ['Industry partners cannot attach problems to hackathon events'], 400);
    }

    let eventForProblem: { id: number; createdById: number } | null = null;
    if (parsed.data.eventId) {
      if (!authorize(user, 'ADMIN')) {
        return errorRes('Forbidden', ['Only admin can add or manage hackathon event problem statements'], 403);
      }

      eventForProblem = await prisma.hackathonEvent.findUnique({
        where: { id: parsed.data.eventId },
        select: { id: true, createdById: true },
      });
      if (!eventForProblem) return errorRes('Invalid eventId', ['Hackathon event not found'], 404);
    } else if (parsed.data.mode !== 'OPEN') {
      return errorRes('Invalid mode', ['Open innovation problems must be OPEN. Hackathon problems are managed inside event workspace.'], 400);
    }

    const finalProblemType = requestedProblemType;
    const finalApprovalStatus = finalProblemType === 'INTERNSHIP' ? 'PENDING_APPROVAL' : 'APPROVED';

    const normalizedIndustryName =
      (parsed.data.isIndustryProblem || finalProblemType === 'INTERNSHIP') &&
      typeof parsed.data.industryName === 'string' &&
      parsed.data.industryName.trim().length > 0
        ? parsed.data.industryName.trim()
        : null;

    if (finalProblemType === 'INTERNSHIP' && !normalizedIndustryName) {
      return errorRes('Validation failed', ['Industry name is required for internship opportunities'], 400);
    }

    const problem = await prisma.problem.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        tags: parsed.data.tags || null,
        isIndustryProblem: finalProblemType === 'INTERNSHIP' ? true : parsed.data.isIndustryProblem,
        industryName: normalizedIndustryName,
        problemType: finalProblemType,
        approvalStatus: finalApprovalStatus,
        mode: parsed.data.eventId ? 'CLOSED' : parsed.data.mode,
        status: parsed.data.eventId ? 'CLOSED' : 'OPENED',
        createdById: user.id,
        industryId: finalProblemType === 'INTERNSHIP' ? requesterIndustryId : null,
        eventId: parsed.data.eventId ?? null,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        event: { select: { id: true, title: true, status: true } },
      },
    });

    let supportDocumentKey: string | null = null;
    if (supportDocumentFile) {
      if (problem.eventId || problem.mode !== 'OPEN') {
        return errorRes('Invalid support document upload', ['Support document is allowed only for OPEN problem statements'], 400);
      }

      const allowedMime = ['application/pdf'];
      if (!allowedMime.includes(supportDocumentFile.type)) {
        return errorRes('Invalid file type', ['Support document must be a PDF file'], 400);
      }

      const buffer = Buffer.from(await supportDocumentFile.arrayBuffer());
      const objectKey = `innovation/open-problems/${problem.id}/support/${Date.now()}-${sanitizeFilename(supportDocumentFile.name)}`;

      supportDocumentKey = await uploadFileWithObjectKey(objectKey, {
        buffer,
        mimetype: supportDocumentFile.type,
        size: buffer.length,
      });

      await prisma.problem.update({
        where: { id: problem.id },
        data: { supportDocumentKey },
      });
    }

    // Create questions if provided
    let questionsData: unknown[] = [];
    if (body.questions && !problem.eventId && problem.mode === 'OPEN') {
      try {
        const questionsRaw = typeof body.questions === 'string' ? JSON.parse(body.questions) : body.questions;
        if (Array.isArray(questionsRaw) && questionsRaw.length > 0) {
          const validQuestions = questionsRaw.filter((q) => q && typeof q.questionText === 'string' && q.questionText.trim().length > 0);

          if (validQuestions.length > 0) {
            questionsData = await Promise.all(
              validQuestions.map((q) =>
                prisma.problemQuestion.create({
                  data: {
                    problemId: problem.id,
                    questionText: q.questionText.trim(),
                    type: q.type && ['TEXT', 'LONG_TEXT'].includes(q.type) ? q.type : 'TEXT',
                  },
                })
              )
            );
          }
        }
      } catch {
        // Silently ignore invalid questions JSON
      }
    }

    const supportDocumentUrl = supportDocumentKey ? await getSignedUrl(supportDocumentKey).catch(() => null) : null;

    return successRes(
      {
        ...problem,
        supportDocumentKey,
        supportDocumentUrl,
        questions: questionsData,
      },
      'Problem created successfully.',
      201
    );
  } catch (err) {
    console.error('Innovation problems POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
