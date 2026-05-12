import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import {
  requireIndustryAccess,
  requireParticipantAccess,
  InternshipWorkspaceError,
} from '@/lib/internship-workspace';
import { createNotifications } from '@/lib/notifications';
import { getSignedUrl, uploadFile } from '@/lib/minio';

const documentTypeSchema = z.enum(['FILE', 'LINK']);

const createSchema = z
  .object({
    problemId: z.number().int().positive(),
    documentType: documentTypeSchema.optional(),
    title: z.string().trim().min(1).optional(),
    fileUrl: z.string().url().optional(),
    linkUrl: z.string().url().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.documentType === 'LINK') {
      if (!data.linkUrl) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'linkUrl is required for link documents.' });
      }
      if (!data.title) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'title is required for link documents.' });
      }
      return;
    }

    if (!data.fileUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'fileUrl is required for file uploads.' });
    }
  });

const querySchema = z.object({
  problemId: z.coerce.number().int().positive(),
});

const toResolvedDocumentUrl = async (storedValue: string) => {
  if (/^https?:\/\//i.test(storedValue) || storedValue.startsWith('/')) {
    return storedValue;
  }
  return await getSignedUrl(storedValue).catch(() => storedValue);
};

const toDocumentResponse = async (doc: {
  id: number;
  documentType: 'FILE' | 'LINK';
  title: string | null;
  fileUrl: string | null;
  linkUrl: string | null;
  createdAt: Date;
  uploadedBy: { id: number; name: string; email: string };
}) => {
  const resolvedFileUrl = doc.fileUrl ? await toResolvedDocumentUrl(doc.fileUrl) : null;
  return {
    ...doc,
    fileUrl: resolvedFileUrl,
    linkUrl: doc.linkUrl,
  };
};

// GET /api/documents?problemId
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    await requireParticipantAccess(user, parsed.data.problemId);

    const documents = await prisma.internshipDocument.findMany({
      where: { problemId: parsed.data.problemId },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { id: true, name: true, email: true } } },
    });

    const resolvedDocuments = await Promise.all(documents.map((doc) => toDocumentResponse(doc)));

    return successRes(resolvedDocuments, 'Documents retrieved successfully.');
  } catch (err) {
    if (err instanceof InternshipWorkspaceError) {
      return errorRes(err.message, err.details, err.status);
    }
    console.error('Documents GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// POST /api/documents
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);

    const contentType = req.headers.get('content-type') || '';
    let parsed: ReturnType<typeof createSchema.safeParse>;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const problemIdRaw = formData.get('problemId');
      const attachmentRaw = formData.get('file');

      if (!(attachmentRaw instanceof File)) {
        return errorRes('Validation failed', ['A file attachment is required.'], 400);
      }

      if (attachmentRaw.size === 0) {
        return errorRes('Validation failed', ['Attachment is empty.'], 400);
      }

      if (attachmentRaw.size > 20 * 1024 * 1024) {
        return errorRes('Validation failed', ['Attachment is too large. Maximum allowed size is 20 MB.'], 400);
      }

      const buffer = Buffer.from(await attachmentRaw.arrayBuffer());
      const uploadedObjectKey = await uploadFile('internship-documents', {
        buffer,
        originalname: attachmentRaw.name,
        mimetype: attachmentRaw.type || 'application/octet-stream',
        size: buffer.length,
      });

      parsed = createSchema.safeParse({
        problemId: typeof problemIdRaw === 'string' ? Number(problemIdRaw) : NaN,
        documentType: 'FILE',
        title: attachmentRaw.name,
        fileUrl: uploadedObjectKey,
      });
    } else {
      const body = await req.json();
      parsed = createSchema.safeParse(body);
    }

    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    await requireIndustryAccess(user, parsed.data.problemId);

    const documentType = parsed.data.documentType ?? 'FILE';
    const document = await prisma.internshipDocument.create({
      data: {
        problemId: parsed.data.problemId,
        documentType,
        title: parsed.data.title ?? null,
        fileUrl: parsed.data.fileUrl ?? null,
        linkUrl: parsed.data.linkUrl ?? null,
        uploadedById: user.id,
      },
      include: { uploadedBy: { select: { id: true, name: true, email: true } } },
    });

    const resolvedDocument = await toDocumentResponse(document);

    const participants = await prisma.application.findMany({
      where: { problemId: parsed.data.problemId, status: 'SELECTED' },
      select: { userId: true },
    });

    await createNotifications(
      participants.map((row) => ({
        userId: row.userId,
        type: 'DOCUMENT_UPLOADED',
        title: 'New internship document uploaded',
        body: resolvedDocument.linkUrl || resolvedDocument.fileUrl || '',
      }))
    );

    return successRes(resolvedDocument, 'Document uploaded successfully.', 201);
  } catch (err) {
    if (err instanceof InternshipWorkspaceError) {
      return errorRes(err.message, err.details, err.status);
    }
    console.error('Documents POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
