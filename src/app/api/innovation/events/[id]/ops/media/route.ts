import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent } from '@/lib/hackathon-ops';
import { uploadFile } from '@/lib/minio';

const KIND_LIMITS: Record<string, { max: number; mime: RegExp }> = {
  REPORT: { max: 20 * 1024 * 1024, mime: /^application\/pdf$/ },
  PHOTO: { max: 10 * 1024 * 1024, mime: /^image\/(png|jpe?g|webp)$/ },
  VIDEO: { max: 100 * 1024 * 1024, mime: /^video\/(mp4|webm)$/ },
};

// GET  — media for the event (public)
// POST — upload media { kind, caption? } + file (ADMIN)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const eventId = Number((await params).id);
    const rows = await prisma.eventMedia.findMany({
      where: { eventId },
      orderBy: [{ kind: 'asc' }, { createdAt: 'desc' }],
    });
    return successRes({ media: rows });
  } catch (err) {
    console.error('media GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId }, select: { coordinatorId: true, coordinators: { select: { userId: true } }, config: true } });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);
    const form = await req.formData();
    const kind = String(form.get('kind') || '').toUpperCase();
    const caption = ((form.get('caption') as string) || '').trim().slice(0, 300) || null;
    const file = form.get('file') as File | null;

    const limits = KIND_LIMITS[kind];
    if (!limits) return errorRes('Invalid kind', ['Kind must be REPORT, PHOTO or VIDEO'], 400);
    if (!file || !file.size) return errorRes('File is required', [], 400);
    if (file.size > limits.max) {
      return errorRes('File too large', [`Max ${Math.round(limits.max / 1024 / 1024)} MB for ${kind}`], 400);
    }
    if (!limits.mime.test(file.type)) {
      return errorRes('Unsupported file type', [`${kind} uploads accept: ${limits.mime.source.replace(/[\\^$]/g, '')}`], 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileKey = await uploadFile(`events/${eventId}/media`, {
      buffer,
      originalname: file.name,
      mimetype: file.type,
      size: file.size,
    });

    const row = await prisma.eventMedia.create({
      data: { eventId, kind, fileKey, caption },
    });
    return successRes({ media: row }, `${kind} uploaded`, 201);
  } catch (err) {
    console.error('media POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
