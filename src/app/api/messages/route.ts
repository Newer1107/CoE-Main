import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { requireParticipantAccess, InternshipWorkspaceError } from '@/lib/internship-workspace';
import { createNotifications } from '@/lib/notifications';
import { uploadFile } from '@/lib/minio';

const createSchema = z.object({
  problemId: z.number().int().positive(),
  content: z.string().trim().optional(),
});

const querySchema = z.object({
  problemId: z.coerce.number().int().positive(),
});

// GET /api/messages?problemId
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    await requireParticipantAccess(user, parsed.data.problemId);

    const messages = await prisma.internshipMessage.findMany({
      where: { problemId: parsed.data.problemId },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { id: true, name: true, email: true, role: true } } },
    });

    return successRes(messages, 'Messages retrieved successfully.');
  } catch (err) {
    if (err instanceof InternshipWorkspaceError) {
      return errorRes(err.message, err.details, err.status);
    }
    console.error('Messages GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// POST /api/messages
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);

    const contentType = req.headers.get('content-type') || '';
    let parsed: ReturnType<typeof createSchema.safeParse>;
    let attachment: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const problemIdRaw = formData.get('problemId');
      const contentRaw = formData.get('content');
      const attachmentRaw = formData.get('attachment');

      parsed = createSchema.safeParse({
        problemId: typeof problemIdRaw === 'string' ? Number(problemIdRaw) : NaN,
        content: typeof contentRaw === 'string' ? contentRaw : undefined,
      });

      attachment = attachmentRaw instanceof File ? attachmentRaw : null;
    } else {
      const body = await req.json();
      parsed = createSchema.safeParse(body);
    }

    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    const trimmedContent = parsed.data.content?.trim() || '';
    if (!trimmedContent && !attachment) {
      return errorRes('Validation failed', ['Message content or an attachment is required.'], 400);
    }

    if (attachment && attachment.size === 0) {
      return errorRes('Validation failed', ['Attachment is empty.'], 400);
    }

    if (attachment && attachment.size > 20 * 1024 * 1024) {
      return errorRes('Validation failed', ['Attachment is too large. Maximum allowed size is 20 MB.'], 400);
    }

    const problem = await requireParticipantAccess(user, parsed.data.problemId);

    let attachmentUrl: string | null = null;

    if (attachment) {
      const buffer = Buffer.from(await attachment.arrayBuffer());
      const objectKey = await uploadFile('internship-documents', {
        buffer,
        originalname: attachment.name,
        mimetype: attachment.type || 'application/octet-stream',
        size: buffer.length,
      });

      const encodedPath = objectKey
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
      attachmentUrl = `/api/storage/${encodedPath}`;

      await prisma.internshipDocument.create({
        data: {
          problemId: parsed.data.problemId,
          documentType: 'FILE',
          title: attachment.name,
          fileUrl: objectKey,
          linkUrl: null,
          uploadedById: user.id,
        },
      });
    }

    const finalContent = attachmentUrl
      ? `${trimmedContent || 'Attachment uploaded'}\n${attachmentUrl}`
      : trimmedContent;

    const message = await prisma.internshipMessage.create({
      data: {
        problemId: parsed.data.problemId,
        senderId: user.id,
        content: finalContent,
      },
      include: { sender: { select: { id: true, name: true, email: true, role: true } } },
    });

    const participants = await prisma.application.findMany({
      where: { problemId: parsed.data.problemId, status: 'SELECTED' },
      select: { userId: true },
    });

    const recipients = new Set<number>(participants.map((row) => row.userId));
    recipients.add(problem.createdById);

    if (problem.industryId) {
      const industryPartners = await prisma.user.findMany({
        where: { industryId: problem.industryId, role: 'INDUSTRY_PARTNER' },
        select: { id: true },
      });
      industryPartners.forEach((partner) => recipients.add(partner.id));
    }
    recipients.delete(user.id);

    await createNotifications(
      Array.from(recipients).map((userId) => ({
        userId,
        type: 'MESSAGE_POSTED',
        title: 'New internship message',
        body: finalContent.slice(0, 160),
      }))
    );

    return successRes(message, 'Message sent successfully.', 201);
  } catch (err) {
    if (err instanceof InternshipWorkspaceError) {
      return errorRes(err.message, err.details, err.status);
    }
    console.error('Messages POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
