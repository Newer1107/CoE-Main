import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationEventUpdateSchema } from '@/lib/validators';
import { canTransitionEventStatus } from '@/lib/innovation';
import { uploadFileWithObjectKey } from '@/lib/minio';
import { sanitizeFilename } from '@/lib/innovation';

const parseBooleanLike = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'on'].includes(normalized);
  }
  return false;
};

// PATCH /api/innovation/events/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { id } = await params;
    const eventId = Number(id);
    if (!Number.isInteger(eventId) || eventId <= 0) return errorRes('Invalid event id', [], 400);

    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
    if (!event) return errorRes('Hackathon event not found', [], 404);

    const contentType = req.headers.get('content-type') || '';
    let body: Record<string, unknown> = {};
    let pptFile: File | null = null;
    let removePptFile = false;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();

      const titleRaw = (formData.get('title') as string) || undefined;
      const descriptionRaw = formData.get('description') as string | null;
      const startTimeRaw = (formData.get('startTime') as string) || undefined;
      const endTimeRaw = (formData.get('endTime') as string) || undefined;
      const submissionLockAtRaw = formData.get('submissionLockAt') as string | null;
      const totalSessionsRaw = (formData.get('totalSessions') as string) || undefined;
      const registrationOpenRaw = formData.get('registrationOpen');
      const statusRaw = (formData.get('status') as string) || undefined;
      const removePptRaw = formData.get('removePptFile');

      body = {
        ...(typeof titleRaw !== 'undefined' ? { title: titleRaw.trim() } : {}),
        ...(descriptionRaw !== null ? { description: descriptionRaw.trim() } : {}),
        ...(typeof startTimeRaw !== 'undefined' ? { startTime: startTimeRaw } : {}),
        ...(typeof endTimeRaw !== 'undefined' ? { endTime: endTimeRaw } : {}),
        ...(submissionLockAtRaw !== null ? { submissionLockAt: submissionLockAtRaw } : {}),
        ...(typeof totalSessionsRaw !== 'undefined' ? { totalSessions: totalSessionsRaw } : {}),
        ...(registrationOpenRaw !== null ? { registrationOpen: parseBooleanLike(registrationOpenRaw) } : {}),
        ...(typeof statusRaw !== 'undefined' ? { status: statusRaw.trim().toUpperCase() } : {}),
      };

      removePptFile = removePptRaw !== null ? parseBooleanLike(removePptRaw) : false;
      pptFile = formData.get('pptFile') as File | null;
    } else {
      body = await req.json();
      removePptFile = parseBooleanLike(body.removePptFile);
    }

    const parsed = innovationEventUpdateSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const updateData: Record<string, unknown> = {};
    if (typeof parsed.data.title !== 'undefined') updateData.title = parsed.data.title;
    if (typeof parsed.data.description !== 'undefined') updateData.description = parsed.data.description || null;
    if (typeof parsed.data.startTime !== 'undefined') updateData.startTime = new Date(parsed.data.startTime);
    if (typeof parsed.data.endTime !== 'undefined') updateData.endTime = new Date(parsed.data.endTime);
    if (typeof parsed.data.submissionLockAt !== 'undefined') {
      updateData.submissionLockAt = parsed.data.submissionLockAt ? new Date(parsed.data.submissionLockAt) : null;
    }
    if (typeof parsed.data.totalSessions !== 'undefined') updateData.totalSessions = parsed.data.totalSessions;
    if (typeof parsed.data.registrationOpen !== 'undefined') updateData.registrationOpen = parsed.data.registrationOpen;

    const nextStart = (updateData.startTime as Date | undefined) ?? event.startTime;
    const nextEnd = (updateData.endTime as Date | undefined) ?? event.endTime;
    if (nextEnd <= nextStart) return errorRes('Invalid event timing', ['endTime must be after startTime'], 400);

    const hasSubmissionLockUpdate = Object.prototype.hasOwnProperty.call(updateData, 'submissionLockAt');
    const nextSubmissionLock = hasSubmissionLockUpdate
      ? (updateData.submissionLockAt as Date | null)
      : event.submissionLockAt;
    if (nextSubmissionLock && nextSubmissionLock > nextEnd) {
      return errorRes('Invalid submission lock time', ['submissionLockAt must be on or before endTime'], 400);
    }

    if (typeof parsed.data.totalSessions !== 'undefined' && parsed.data.totalSessions < event.totalSessions) {
      const higherSessionSubmission = await prisma.sessionDocument.findFirst({
        where: {
          session: { gt: parsed.data.totalSessions },
          claim: {
            problem: {
              eventId,
            },
          },
        },
        select: { id: true, session: true },
      });

      if (higherSessionSubmission) {
        return errorRes(
          'Invalid session reduction',
          [`Cannot reduce total sessions below ${higherSessionSubmission.session} because documents already exist for higher sessions.`],
          400,
        );
      }
    }

    if (typeof parsed.data.status !== 'undefined' && parsed.data.status !== event.status) {
      if (!canTransitionEventStatus(event.status, parsed.data.status)) {
        return errorRes('Invalid status transition', [`${event.status} can only transition to the next state`], 400);
      }
      updateData.status = parsed.data.status;
    }

    if (pptFile) {
      const allowed = [
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/pdf',
      ];

      if (!allowed.includes(pptFile.type)) {
        return errorRes('Invalid file type', ['Only PPT, PPTX, or PDF is allowed'], 400);
      }

      const buffer = Buffer.from(await pptFile.arrayBuffer());
      const objectKey = `innovation/events/${eventId}/${Date.now()}-${sanitizeFilename(pptFile.name)}`;
      const pptFileKey = await uploadFileWithObjectKey(objectKey, {
        buffer,
        mimetype: pptFile.type,
        size: buffer.length,
      });

      updateData.pptFileKey = pptFileKey;
    } else if (removePptFile) {
      updateData.pptFileKey = null;
    }

    if (Object.keys(updateData).length > 0 || typeof parsed.data.totalSessions !== 'undefined') {
      await prisma.$transaction(async (tx) => {
        if (Object.keys(updateData).length > 0) {
          await tx.hackathonEvent.update({ where: { id: eventId }, data: updateData });
        }

        const targetTotalSessions = (updateData.totalSessions as number | undefined) ?? event.totalSessions;
        const existingLocks = await tx.hackathonSessionUploadLock.findMany({
          where: { eventId },
          select: { session: true },
        });
        const existingSessionSet = new Set(existingLocks.map((row) => row.session));

        const toCreate: Array<{ eventId: number; session: number; isOpen: boolean; updatedByUserId: number }> = [];
        for (let session = 1; session <= targetTotalSessions; session += 1) {
          if (!existingSessionSet.has(session)) {
            toCreate.push({
              eventId,
              session,
              isOpen: false,
              updatedByUserId: user.id,
            });
          }
        }

        if (toCreate.length > 0) {
          await tx.hackathonSessionUploadLock.createMany({ data: toCreate });
        }

        await tx.hackathonSessionUploadLock.deleteMany({
          where: {
            eventId,
            session: { gt: targetTotalSessions },
          },
        });
      });
    }

    const updated = await prisma.hackathonEvent.findUnique({
      where: { id: eventId },
      include: {
        _count: { select: { problems: true } },
        problems: { select: { id: true, title: true, status: true, mode: true } },
        sessionUploadLocks: {
          orderBy: { session: 'asc' },
          select: { session: true, isOpen: true, updatedAt: true },
        },
      },
    });

    return successRes(updated, 'Hackathon event updated successfully.');
  } catch (err) {
    console.error('Innovation events PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
