import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent } from '@/lib/hackathon-ops';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; noticeId: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const noticeId = Number((await params).noticeId);
    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId }, select: { coordinatorId: true, coordinators: { select: { userId: true } }, config: true } });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);
    const body = await req.json().catch(() => null);

    const notice = await prisma.notice.findFirst({ where: { id: noticeId, eventId } });
    if (!notice) return errorRes('Notice not found', [], 404);

    const updated = await prisma.notice.update({
      where: { id: noticeId },
      data: {
        title: body?.title != null ? String(body.title).trim().slice(0, 200) : notice.title,
        body: body?.body != null ? String(body.body).trim() : notice.body,
        pinned: body?.pinned != null ? !!body.pinned : notice.pinned,
        fileKey: body?.fileKey != null ? (body.fileKey ? String(body.fileKey).slice(0, 500) : null) : notice.fileKey,
      },
    });
    return successRes({ notice: updated }, 'Notice updated');
  } catch (err) {
    console.error('notice PUT error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; noticeId: string }> }) {
  try {
    const user = authenticate(req);
    if (!user || user.role !== 'ADMIN') return errorRes('Admins only', [], 403);
    const eventId = Number((await params).id);
    const noticeId = Number((await params).noticeId);
    const notice = await prisma.notice.findFirst({ where: { id: noticeId, eventId } });
    if (!notice) return errorRes('Notice not found', [], 404);
    await prisma.notice.delete({ where: { id: noticeId } });
    return successRes({ deleted: true }, 'Notice deleted');
  } catch (err) {
    console.error('notice DELETE error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
