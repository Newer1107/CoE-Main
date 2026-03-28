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

    if (!['JUDGING', 'CLOSED'].includes(event.status)) {
      return errorRes('Leaderboard not available', ['Leaderboard is visible only during JUDGING or CLOSED phases'], 400);
    }

    const ranked = await getEventLeaderboard(prisma, eventId);

    const claims = await prisma.claim.findMany({
      where: { id: { in: ranked.map((row) => row.claimId) } },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    const claimMap = new Map(claims.map((claim) => [claim.id, claim]));
    const payload = ranked.map((row) => ({
      rank: row.rank,
      teamName: row.teamName,
      score: row.score,
      updatedAt: row.updatedAt,
      members: (claimMap.get(row.claimId)?.members || []).map((member) => ({
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        role: member.role,
      })),
    }));

    return successRes(payload, 'Leaderboard retrieved.');
  } catch (err) {
    console.error('Innovation leaderboard GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
