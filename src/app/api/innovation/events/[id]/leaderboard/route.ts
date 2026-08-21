import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { errorRes, successRes } from '@/lib/api-helpers';
import { getEventLeaderboard } from '@/lib/innovation';

// GET /api/innovation/events/[id]/leaderboard
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const opsCfg = ((event.config as { ops?: Record<string, unknown> } | null)?.ops ?? {}) as Record<string, unknown>;
    const anyDeptDeclared = Object.keys((opsCfg.round1DeclaredByDept ?? {}) as Record<string, unknown>).length > 0;
    const visibleNow =
      event.status === 'CLOSED' ||
      (visibleAfter === 'LIVE' && (event.status === 'ACTIVE' || event.status === 'JUDGING')) ||
      (event.status === 'JUDGING' && anyDeptDeclared);

    if (!visibleNow) {
      return errorRes('Leaderboard not available', ['Leaderboard is not visible for this event stage'], 400);
    }

    const deptParam = (req.nextUrl.searchParams.get('dept') ?? '').trim().toUpperCase() || null;
    const phaseParam = Number(req.nextUrl.searchParams.get('phase')) || 0;
    const ranked = await getEventLeaderboard(prisma, eventId, deptParam, phaseParam);

    const claims = await prisma.claim.findMany({
      where: { id: { in: ranked.map((row) => row.claimId) } },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, uid: true } },
          },
        },
        rubricScores: { include: { rubricCategory: true } },
      },
    });

    // Identity-stripped judge comments (final round only) when enabled and results are final.
    const cfg = ((event.config ?? {}) as { ops?: { commentsToStudents?: boolean } }).ops ?? {};
    const showComments = event.status === 'CLOSED' && !!cfg.commentsToStudents;
    const claimMap = new Map(claims.map((claim) => [claim.id, claim]));
    const payload = ranked.map((row) => {
      const claim = claimMap.get(row.claimId);
      let comments: string[] = [];
      if (showComments && claim) {
        const byRound = new Map<number, { comment: string | null }[]>();
        for (const s of claim.rubricScores) {
          const list = byRound.get(s.round) ?? [];
          list.push({ comment: s.comment });
          byRound.set(s.round, list);
        }
        const lastRound = byRound.size > 0 ? Math.max(...byRound.keys()) : 1;
        comments = (byRound.get(lastRound) ?? [])
          .map((s) => (s.comment ?? '').trim())
          .filter((c) => c.length > 0 && !c.startsWith('[OVERRIDE]'));
      }
      const leadUid = (claim?.members?.find((m: {role:string}) => m.role==='LEAD') as {user:{uid:string|null}}|undefined)?.user.uid ?? null;
      const _map: Record<string,string> = { CSECSA:'CSE',CSECSB:'CSE',CSECSC:'CSE',CSECS:'CSE',CSEIOT:'CSE',CSEA:'CSE',CSEB:'CSE',CSEC:'CSE',COMP:'COMP',IT:'IT',CSE:'CSE',AIML:'AIML',AIDS:'AIDS',ECSA:'ECSA',ECS:'ECS',EXTC:'ENTC',ENTC:'ENTC',EXT:'ENTC',MME:'MME',MECH:'MECH',CIVIL:'CIVIL',BVOC:'BVOC',MCA:'MCA',BCA:'BCA',IOT:'IOT' };
      const raw2 = (leadUid ?? '').toString().trim().toUpperCase().replace(/&/g,'');
      const mm = raw2.match(/^(\d{2})-([A-Z]+)/);
      let b2 = mm ? mm[2] : raw2;
      let deptCode = b2;
      for (const [k,v] of Object.entries(_map)) if (b2.startsWith(k)) { deptCode=v; break; }
      return {
        rank: row.rank,
        teamName: row.teamName,
        problemTitle: row.problemTitle,
        score: row.score,
        updatedAt: row.updatedAt,
        dept: deptCode || '—',
        comments: Array.from(new Set(comments)),
        members: (claim?.members || []).map((member) => ({
          id: member.user.id,
          name: member.user.name,
          role: member.role,
        })),
      };
    });

    return successRes(payload, 'Leaderboard retrieved.');
  } catch (err) {
    console.error('Innovation leaderboard GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
