import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { committeeTrackRoomUpdateSchema } from '@/lib/committee-validators';

// PATCH /api/committee/admin/tracks/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { id } = await params;
    const trackId = Number(id);
    if (!Number.isInteger(trackId) || trackId <= 0) return errorRes('Invalid track id', [], 400);

    const body = await req.json();
    const parsed = committeeTrackRoomUpdateSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const updated = await prisma.committeeTrack.update({
      where: { id: trackId },
      data: {
        room: parsed.data.room?.trim() ? parsed.data.room.trim() : null,
      },
    });

    return successRes(updated, 'Committee track room updated.');
  } catch (err: any) {
    if (err?.code === 'P2025') return errorRes('Committee track not found', [], 404);
    console.error('Committee track PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
