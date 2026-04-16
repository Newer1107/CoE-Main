import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { getSignedUrl, uploadFileWithObjectKey } from '@/lib/minio';
import { sanitizeFilename } from '@/lib/innovation';
import { innovationSessionDocumentUploadSchema } from '@/lib/validators';

const CLAIM_STATUSES_ALLOWED_FOR_SESSION_DOCUMENTS = ['SUBMITTED', 'SHORTLISTED', 'ACCEPTED'] as const;

// GET /api/innovation/claims/[id]/session-documents
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);

    const { id } = await params;
    const claimId = Number(id);
    if (!Number.isInteger(claimId) || claimId <= 0) {
      return errorRes('Invalid claim id', [], 400);
    }

    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      select: {
        id: true,
        teamName: true,
        status: true,
        submissionUrl: true,
        submissionFileKey: true,
        problem: {
          select: {
            eventId: true,
            event: {
              select: {
                id: true,
                title: true,
                status: true,
                totalSessions: true,
                sessionUploadLocks: {
                  orderBy: { session: 'asc' },
                  select: { session: true, isOpen: true, updatedAt: true },
                },
              },
            },
          },
        },
        members: {
          select: {
            userId: true,
            role: true,
          },
        },
        sessionDocuments: {
          select: {
            id: true,
            session: true,
            documentKey: true,
            documentUrl: true,
            uploadedAt: true,
            uploadedByUserId: true,
          },
          orderBy: {
            session: 'asc',
          },
        },
      },
    });

    if (!claim) return errorRes('Claim not found', [], 404);

    const canViewAll = authorize(user, 'ADMIN', 'FACULTY');
    const isClaimMember = claim.members.some((member) => member.userId === user.id);
    if (!canViewAll && !isClaimMember) {
      return errorRes('Forbidden', ['You can only access your team documents'], 403);
    }

    if (!claim.problem.eventId || !claim.problem.event) {
      return errorRes('Claim is not linked to a hackathon event', [], 400);
    }

    const draftDocumentFileUrl = claim.submissionFileKey
      ? await getSignedUrl(claim.submissionFileKey).catch(() => null)
      : null;

    const sessionDocuments = await Promise.all(
      claim.sessionDocuments.map(async (doc) => ({
        id: doc.id,
        session: doc.session,
        documentUrl: doc.documentUrl,
        uploadedAt: doc.uploadedAt,
        uploadedByUserId: doc.uploadedByUserId,
        documentFileUrl: await getSignedUrl(doc.documentKey).catch(() => null),
      }))
    );

    const uploadedSessionSet = new Set(sessionDocuments.map((doc) => doc.session));
    const allSessions = Array.from({ length: claim.problem.event.totalSessions }, (_, index) => index + 1);
    const uploadableSessions = canViewAll
      ? allSessions
      : claim.problem.event.status === 'ACTIVE'
        ? claim.problem.event.sessionUploadLocks.filter((lock) => lock.isOpen).map((lock) => lock.session)
        : [];
    const missingSessions = uploadableSessions.filter((session) => !uploadedSessionSet.has(session));

    const uploadedCount = (claim.submissionFileKey || claim.submissionUrl ? 1 : 0) + sessionDocuments.length;

    return successRes(
      {
        claimId: claim.id,
        teamName: claim.teamName,
        status: claim.status,
        event: {
          id: claim.problem.event.id,
          title: claim.problem.event.title,
          status: claim.problem.event.status,
          totalSessions: claim.problem.event.totalSessions,
          sessionUploadLocks: claim.problem.event.sessionUploadLocks,
          uploadableSessions,
        },
        draftDocument: {
          submissionUrl: claim.submissionUrl,
          submissionFileUrl: draftDocumentFileUrl,
          isUploaded: Boolean(claim.submissionFileKey || claim.submissionUrl),
        },
        sessionDocuments,
        summary: {
          requiredCount: 1 + claim.problem.event.totalSessions,
          uploadedCount,
          missingSessions,
        },
      },
      'Session documents retrieved successfully.'
    );
  } catch (err) {
    console.error('Innovation claim session documents GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// POST /api/innovation/claims/[id]/session-documents
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const { id } = await params;
    const claimId = Number(id);
    if (!Number.isInteger(claimId) || claimId <= 0) {
      return errorRes('Invalid claim id', [], 400);
    }

    const formData = await req.formData();
    const parsed = innovationSessionDocumentUploadSchema.safeParse({
      session: formData.get('session'),
      documentUrl: (formData.get('documentUrl') as string | null) || '',
    });

    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    const file = formData.get('file');
    if (!(file instanceof File)) {
      return errorRes('Validation failed', ['A session document file is required'], 400);
    }

    if (file.size <= 0) {
      return errorRes('Validation failed', ['Uploaded file is empty'], 400);
    }

    const session = parsed.data.session;

    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      select: {
        id: true,
        status: true,
        problem: {
          select: {
            eventId: true,
            event: {
              select: {
                id: true,
                status: true,
                totalSessions: true,
                sessionUploadLocks: {
                  where: {
                    session,
                  },
                  select: {
                    isOpen: true,
                  },
                },
              },
            },
          },
        },
        members: {
          select: {
            userId: true,
            role: true,
          },
        },
      },
    });

    if (!claim) return errorRes('Claim not found', [], 404);

    if (!claim.problem.eventId || !claim.problem.event) {
      return errorRes('Claim is not linked to a hackathon event', [], 400);
    }

    const teamLeadMember = claim.members.find((member) => member.role === 'LEAD');
    if (!teamLeadMember || teamLeadMember.userId !== user.id) {
      return errorRes('Forbidden', ['Only team lead can upload session documents'], 403);
    }

    if (!CLAIM_STATUSES_ALLOWED_FOR_SESSION_DOCUMENTS.includes(claim.status as (typeof CLAIM_STATUSES_ALLOWED_FOR_SESSION_DOCUMENTS)[number])) {
      return errorRes('Invalid claim state', ['Session documents can be uploaded only after initial draft submission'], 400);
    }

    if (session > claim.problem.event.totalSessions) {
      return errorRes('Invalid session', [`Session must be between 1 and ${claim.problem.event.totalSessions}`], 400);
    }

    if (claim.problem.event.status !== 'ACTIVE') {
      return errorRes('Event not open', ['Session document uploads are allowed only after the event is opened'], 403);
    }

    const sessionLock = claim.problem.event.sessionUploadLocks[0];
    if (!sessionLock?.isOpen) {
      return errorRes('Session is locked', [`Session ${session} document upload is currently closed by admin`], 403);
    }

    const existing = await prisma.sessionDocument.findUnique({
      where: {
        claimId_session: {
          claimId,
          session,
        },
      },
      select: { id: true },
    });

    if (existing) {
      return errorRes('Session document already uploaded', [`Session ${session} already has a document`], 409);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const objectKey = `innovation/session-docs/${claimId}/session-${session}/${Date.now()}-${sanitizeFilename(file.name)}`;
    const documentKey = await uploadFileWithObjectKey(objectKey, {
      buffer,
      mimetype: file.type || 'application/octet-stream',
      size: buffer.length,
    });

    const created = await prisma.sessionDocument.create({
      data: {
        claimId,
        session,
        documentUrl: parsed.data.documentUrl || null,
        documentKey,
        uploadedByUserId: user.id,
      },
      select: {
        id: true,
        claimId: true,
        session: true,
        documentUrl: true,
        documentKey: true,
        uploadedAt: true,
      },
    });

    return successRes(
      {
        ...created,
        documentFileUrl: await getSignedUrl(created.documentKey).catch(() => null),
      },
      'Session document uploaded successfully.',
      201
    );
  } catch (err) {
    console.error('Innovation claim session documents POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
