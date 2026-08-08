import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { errorRes, successRes } from '@/lib/api-helpers';
import { getEventLeaderboard } from '@/lib/innovation';

// GET /api/innovation/events/[id]/leaderboard
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const eventId = Number(id);
    if (!Number.isInteger(eventId) || eventId <= 0) return errorRes('Invalid event id', [], 400);

    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
    if (!event) return errorRes('Hackathon event not found', [], 404);

    // Visibility: CLOSED always shows; "LIVE" config also shows during
    // ACTIVE/JUDGING (leaderboard.visibleAfter per-event setting).
    const visibleAfter = (event.config as { leaderboard?: { visibleAfter?: 'CLOSED' | 'LIVE' } } | null)
      ?.leaderboard?.visibleAfter ?? 'CLOSED';
    const visibleNow =
      event.status === 'CLOSED' ||
      (visibleAfter === 'LIVE' && (event.status === 'ACTIVE' || event.status === 'JUDGING'));

    if (!visibleNow) {
      return errorRes('Leaderboard not available', ['Leaderboard is not visible for this event stage'], 400);
    }

    const ranked = await getEventLeaderboard(prisma, eventId);

    const claims = await prisma.claim.findMany({
      where: { id: { in: ranked.map((row) => row.claimId) } },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true } },
          },
        },
      },
    });

    const claimMap = new Map(claims.map((claim) => [claim.id, claim]));
    const payload = ranked.map((row) => ({
      rank: row.rank,
      teamName: row.teamName,
      problemTitle: row.problemTitle,
      score: row.score,
      updatedAt: row.updatedAt,
      members: (claimMap.get(row.claimId)?.members || []).map((member) => ({
        id: member.user.id,
        name: member.user.name,
        role: member.role,
      })),
    }));

    return successRes(payload, 'Leaderboard retrieved.');
  } catch (err) {
    console.error('Innovation leaderboard GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
