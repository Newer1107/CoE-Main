import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationProgramUpdateSchema } from '@/lib/validators';
import { deleteFile, getSignedUrl, uploadFileWithObjectKey } from '@/lib/minio';
import { sanitizeFilename } from '@/lib/innovation';

const getStartOfToday = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
};

const parseBooleanLike = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'on'].includes(normalized);
  }
  return false;
};

// GET /api/innovation/programs/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const program = await prisma.innovationProgram.findUnique({
      where: { id },
      include: {
        _count: { select: { interests: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!program) return errorRes('Program not found', [], 404);

    return successRes(
      {
        ...program,
        interestCount: program._count.interests,
        noticeFileUrl: program.noticeFileKey ? await getSignedUrl(program.noticeFileKey).catch(() => null) : null,
      },
      'Program detail retrieved successfully.',
    );
  } catch (err) {
    console.error('Innovation program detail GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// PATCH /api/innovation/programs/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { id } = await params;
    const existing = await prisma.innovationProgram.findUnique({ where: { id } });
    if (!existing) return errorRes('Program not found', [], 404);

    const formData = await req.formData();
    const body = {
      ...(formData.get('title') !== null ? { title: String(formData.get('title') || '') } : {}),
      ...(formData.get('description') !== null ? { description: String(formData.get('description') || '') } : {}),
      ...(formData.get('programType') !== null ? { programType: String(formData.get('programType') || '') } : {}),
      ...(formData.get('venue') !== null ? { venue: String(formData.get('venue') || '') } : {}),
      ...(formData.get('eventDate') !== null ? { eventDate: String(formData.get('eventDate') || '') } : {}),
      ...(formData.get('startTime') !== null ? { startTime: String(formData.get('startTime') || '') } : {}),
      ...(formData.get('endTime') !== null ? { endTime: String(formData.get('endTime') || '') } : {}),
      ...(formData.get('removeNoticeFile') !== null
        ? { removeNoticeFile: parseBooleanLike(formData.get('removeNoticeFile')) }
        : {}),
    };
    const noticeFile = (formData.get('noticeFile') as File | null) || null;

    const parsed = innovationProgramUpdateSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const updateData: Record<string, unknown> = {};
    if (typeof parsed.data.title !== 'undefined') updateData.title = parsed.data.title;
    if (typeof parsed.data.description !== 'undefined') updateData.description = parsed.data.description;
    if (typeof parsed.data.programType !== 'undefined') updateData.programType = parsed.data.programType;
    if (typeof parsed.data.venue !== 'undefined') updateData.venue = parsed.data.venue;
    if (typeof parsed.data.eventDate !== 'undefined') updateData.eventDate = new Date(parsed.data.eventDate);
    if (typeof parsed.data.startTime !== 'undefined') updateData.startTime = new Date(parsed.data.startTime);
    if (typeof parsed.data.endTime !== 'undefined') updateData.endTime = new Date(parsed.data.endTime);

    const nextEventDate = (updateData.eventDate as Date | undefined) ?? existing.eventDate;
    const nextStartTime = (updateData.startTime as Date | undefined) ?? existing.startTime;
    const nextEndTime = (updateData.endTime as Date | undefined) ?? existing.endTime;
    if (nextEventDate < getStartOfToday()) {
      return errorRes('Validation failed', ['Date must not be in the past'], 400);
    }
    if (nextEndTime <= nextStartTime) {
      return errorRes('Validation failed', ['End time must be after start time'], 400);
    }

    if (noticeFile) {
      if (noticeFile.type !== 'application/pdf') {
        return errorRes('Invalid file type', ['Only PDF notice files are allowed'], 400);
      }

      const buffer = Buffer.from(await noticeFile.arrayBuffer());
      const objectKey = `innovation/programs/${id}/notice/${Date.now()}-${sanitizeFilename(noticeFile.name)}`;
      const noticeFileKey = await uploadFileWithObjectKey(objectKey, {
        buffer,
        mimetype: noticeFile.type,
        size: buffer.length,
      });

      updateData.noticeFileKey = noticeFileKey;
      if (existing.noticeFileKey && existing.noticeFileKey !== noticeFileKey) {
        await deleteFile(existing.noticeFileKey).catch(() => undefined);
      }
    } else if (parsed.data.removeNoticeFile) {
      updateData.noticeFileKey = null;
      if (existing.noticeFileKey) {
        await deleteFile(existing.noticeFileKey).catch(() => undefined);
      }
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.innovationProgram.update({
        where: { id },
        data: updateData,
      });
    }

    const updated = await prisma.innovationProgram.findUnique({
      where: { id },
      include: {
        _count: { select: { interests: true } },
      },
    });

    return successRes(
      {
        ...updated,
        interestCount: updated?._count.interests ?? 0,
        noticeFileUrl: updated?.noticeFileKey ? await getSignedUrl(updated.noticeFileKey).catch(() => null) : null,
      },
      'Program updated successfully.',
    );
  } catch (err) {
    console.error('Innovation program PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// DELETE /api/innovation/programs/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { id } = await params;
    const existing = await prisma.innovationProgram.findUnique({ where: { id } });
    if (!existing) return errorRes('Program not found', [], 404);

    await prisma.innovationProgram.delete({ where: { id } });
    if (existing.noticeFileKey) {
      await deleteFile(existing.noticeFileKey).catch(() => undefined);
    }

    return successRes(null, 'Program deleted successfully.');
  } catch (err) {
    console.error('Innovation program DELETE error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
