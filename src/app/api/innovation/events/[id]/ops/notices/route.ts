import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';

// GET  — notices for the event (public; used by student pages too)
// POST — create notice { title, body, pinned?, fileKey? } (ADMIN)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const eventId = Number((await params).id);
    const notices = await prisma.notice.findMany({
      where: { eventId },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    });
    return successRes({ notices });
  } catch (err) {
    console.error('notices GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user || user.role !== 'ADMIN') return errorRes('Admins only', [], 403);
    const eventId = Number((await params).id);
    const body = await req.json().catch(() => null);
    const title = ((body?.title ?? '') as string).trim().slice(0, 200);
    const bodyText = ((body?.body ?? '') as string).trim();
    if (!title) return errorRes('Notice title is required', [], 400);
    if (!bodyText) return errorRes('Notice body is required', [], 400);

    const notice = await prisma.notice.create({
      data: {
        eventId,
        title,
        body: bodyText,
        pinned: !!body?.pinned,
        fileKey: body?.fileKey ? String(body.fileKey).slice(0, 500) : null,
      },
    });
    return successRes({ notice }, 'Notice published');
  } catch (err) {
    console.error('notices POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
