import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes } from '@/lib/api-helpers';
import { canManageEvent, coordinatorDepartments, currentRound, deptFromUid } from '@/lib/hackathon-ops';

const csvEscape = (v: unknown): string => {
  const text = v == null ? '' : String(v);
  if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
};

// ponytail: dept norm mirrors hackathon-ops.normalizeDeptCode — longest CSE prefixes first
const _DEPT_MAP: Record<string, string> = {
  CSECSA: 'CSE', CSECSB: 'CSE', CSECSC: 'CSE', CSECS: 'CSE', CSEIOT: 'CSE', CSEA: 'CSE', CSEB: 'CSE', CSEC: 'CSE',
  COMP: 'COMP', IT: 'IT', CSE: 'CSE', AIML: 'AIML', AIDS: 'AIDS', ECSA: 'ECSA', ECS: 'ECS',
  EXTC: 'ENTC', ENTC: 'ENTC', EXT: 'ENTC', MME: 'MME', MECH: 'MECH', CIVIL: 'CIVIL', BVOC: 'BVOC', MCA: 'MCA', BCA: 'BCA', IOT: 'IOT',
};
function _normDeptCode(v: string): string {
  const up = v.trim().toUpperCase().replace(/&/g, '');
  if (!up) return '';
  if (up.startsWith('CSE')) return 'CSE';
  if (up === 'EXTC' || up === 'EXT') return 'ENTC';
  for (const [k, code] of Object.entries(_DEPT_MAP)) if (up.startsWith(k)) return code;
  return up;
}

// GET /api/innovation/events/[id]/ops/scores/export?dept=X&venueId=Y
// CSV per team with every detail: team, dept, venue, problem, members, question-by-question YES/NO + avg, per-parent YES/weight, finalScore (weighted avg).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const event = await prisma.hackathonEvent.findUnique({
      where: { id: eventId },
      select: { id: true, coordinatorId: true, coordinators: { select: { userId: true, departmentCode: true } }, config: true },
    });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);

    // Dept scoping: coordinator can only export their dept (unless ADMIN / global)
    const allowedDepts = user.role === 'ADMIN' ? null : coordinatorDepartments(user.id, event);
    const deptParam = (req.nextUrl.searchParams.get('dept') ?? '').trim().toUpperCase();
    const requestedDept = deptParam ? _normDeptCode(deptParam) : null;
    if (requestedDept && allowedDepts !== null && !allowedDepts.includes(requestedDept)) {
      return errorRes('Not allowed for this department', [], 403);
    }
    const effectiveDept = requestedDept ?? (allowedDepts?.[0] ?? null);
    const venueIdParam = req.nextUrl.searchParams.get('venueId');
    const venueId = venueIdParam ? Number(venueIdParam) : null;

    const round = currentRound(event);

    const categories = await prisma.rubricCategory.findMany({
      where: { eventId },
      orderBy: [{ parentCategoryId: 'asc' }, { order: 'asc' }],
      select: { id: true, key: true, label: true, weight: true, isCritical: true, parentCategoryId: true },
    });
    const parents = categories.filter((c) => c.parentCategoryId === null);
    const isBinary = categories.some((c) => c.parentCategoryId !== null);
    const childToParent = new Map<number, number>();
    for (const c of categories) if (c.parentCategoryId !== null) childToParent.set(c.id, c.parentCategoryId);
    const parentMap = new Map(parents.map((p) => [p.id, p.weight]));
    const byParentChildren = new Map<number, typeof categories>();
    for (const c of categories) if (c.parentCategoryId !== null) {
      const list = byParentChildren.get(c.parentCategoryId) ?? [];
      list.push(c);
      byParentChildren.set(c.parentCategoryId, list);
    }

    const claimsRaw = await prisma.claim.findMany({
      where: { problem: { eventId }, ...(venueId ? { venueId } : {}) },
      select: {
        id: true,
        teamName: true,
        status: true,
        score: true,
        finalScore: true,
        venue: { select: { id: true, name: true } },
        problem: { select: { id: true, title: true } },
        members: { include: { user: { select: { name: true, email: true, uid: true } } }, orderBy: { role: 'asc' } },
        rubricScores: { where: { round }, include: { rubricCategory: { select: { id: true, key: true, label: true } }, judge: { select: { id: true, name: true } } } },
      },
      orderBy: { id: 'asc' },
    });

    let claims = claimsRaw;
    if (effectiveDept) {
      claims = claimsRaw.filter((c: { members: { role: string; user: { uid: string | null } }[] }) => {
        const lead = c.members.find((m) => m.role === 'LEAD');
        return _normDeptCode(deptFromUid(lead?.user.uid) ?? '') === effectiveDept;
      });
    } else if (allowedDepts !== null) {
      claims = claimsRaw.filter((c: { members: { role: string; user: { uid: string | null } }[] }) => {
        const lead = c.members.find((m) => m.role === 'LEAD');
        const dept = _normDeptCode(deptFromUid(lead?.user.uid) ?? '');
        return allowedDepts.includes(dept);
      });
    }

    // Header: fixed cols + per-question cols + per-parent cols + final
    const fixedHeaders = ['Team ID', 'Team Name', 'Dept', 'Venue', 'Problem', 'Status', 'Lead Name', 'Lead UID', 'Lead Email', 'Members (all)'];
    const questionHeaders: string[] = [];
    const children = categories.filter((c) => c.parentCategoryId !== null);
    for (const ch of children) {
      const parent = parents.find((p) => p.id === ch.parentCategoryId);
      questionHeaders.push(`${parent?.label ?? '—'}: ${ch.label} (${ch.isCritical ? 'C' : 'S'})`);
    }
    const parentHeaders: string[] = [];
    for (const p of parents) parentHeaders.push(`${p.label} YES/5`);
    for (const p of parents) parentHeaders.push(`${p.label} weighted (${p.weight})`);
    const tailHeaders = ['Final Score (0-100)', 'Rank (within export)'];

    const headers = [...fixedHeaders, ...questionHeaders, ...parentHeaders, ...tailHeaders];

    // Precompute rows with scores for ranking
    type Row = { claim: typeof claims[number]; dept: string; finalScore: number; perParent: Map<number, { yes: number; total: number; weighted: string }>; perQuestion: string[] };
    const rows: Row[] = [];

    for (const claim of claims) {
      const lead = (claim as { members: { role: string; user: { name: string; uid: string | null; email: string } }[] }).members.find((m) => m.role === 'LEAD');
      const dept = _normDeptCode(deptFromUid(lead?.user.uid) ?? '') || '—';
      const membersAll = (claim as { members: { user: { name: string; uid: string | null } }[] }).members.map((m) => `${m.user.name}(${m.user.uid ?? ''})`).join('; ');

      // per-judge averaging for finalScore (same as CLOSED calc)
      const judgeIds = new Set((claim.rubricScores as { judgeId: number }[]).map((s) => s.judgeId ?? 0));
      let finalScore = 0;
      const perParent = new Map<number, { yes: number; total: number; weighted: string }>();
      for (const parent of parents) {
        let sumYesRate = 0, scoredJudges = 0;
        for (const jid of judgeIds) {
          const rows2 = (claim.rubricScores as { rubricCategory: { id: number }; judgeId: number; score: number }[]).filter((s) => (s.judgeId ?? 0) === jid && childToParent.get(s.rubricCategory.id) === parent.id);
          if (rows2.length === 0) continue;
          const yes = rows2.filter((r) => r.score > 0).length;
          sumYesRate += yes / 5;
          scoredJudges++;
        }
        const avgYesRate = scoredJudges === 0 ? 0 : sumYesRate / scoredJudges;
        const weighted = avgYesRate * parent.weight;
        finalScore += weighted;
        const yesCount = isBinary ? Math.round(sumYesRate * 5 / Math.max(scoredJudges, 1)) : 0; // approx for display
        perParent.set(parent.id, { yes: yesCount, total: 5, weighted: avgYesRate > 0 ? weighted.toFixed(1) : '0.0' });
      }
      finalScore = Math.round(finalScore);

      // per-question avg (when multi-judge, average 0/1)
      const perQuestion: string[] = [];
      for (const ch of children) {
        const rows2 = (claim.rubricScores as { rubricCategory: { id: number }; score: number }[]).filter((s) => s.rubricCategory.id === ch.id);
        if (rows2.length === 0) perQuestion.push('—');
        else {
          const avg = rows2.reduce((a, b) => a + b.score, 0) / rows2.length;
          perQuestion.push(avg >= 0.5 ? 'YES' : 'NO');
        }
      }
      rows.push({ claim: claim as typeof claims[number], dept, finalScore, perParent, perQuestion });
    }

    // Rank within export (by finalScore desc, stable by id)
    rows.sort((a, b) => b.finalScore - a.finalScore || a.claim.id - b.claim.id);
    const rankById = new Map(rows.map((r, i) => [r.claim.id, i + 1] as const));

    const lines: string[] = [];
    for (const r of rows) {
      const claim = r.claim as { id: number; teamName: string | null; status: string; venue: { name: string } | null; problem: { title: string } | null; members: { role: string; user: { name: string; uid: string | null; email: string } }[] };
      const lead = claim.members.find((m) => m.role === 'LEAD');
      const base: (string | number)[] = [
        claim.id,
        claim.teamName ?? `Team-${claim.id}`,
        r.dept,
        claim.venue?.name ?? '—',
        claim.problem?.title ?? '—',
        claim.status,
        lead?.user.name ?? '—',
        lead?.user.uid ?? '',
        lead?.user.email ?? '',
        (claim.members as { user: { name: string; uid: string | null } }[]).map((m) => `${m.user.name}(${m.user.uid ?? ''})`).join('; '),
      ];
      // questions
      const qVals = r.perQuestion;
      // parent YES/5 strings
      const parentYes: string[] = parents.map((p) => {
        const v = r.perParent.get(p.id);
        return v ? `${((r.perParent.get(p.id)!.weighted !== '0.0' ? (Number(r.perParent.get(p.id)!.weighted) / p.weight * 5).toFixed(1) : '0') )}/5` : '0/5';
      });
      const parentWeighted: string[] = parents.map((p) => r.perParent.get(p.id)?.weighted ?? '0.0');
      const tail = [r.finalScore, rankById.get(claim.id) ?? ''];

      // Recompute YES count properly from rows for accurate display
      const yesCounts = parents.map((p) => {
        const kids = byParentChildren.get(p.id) ?? [];
        let sum = 0;
        for (const ch of kids) {
          const rows2 = ((r.claim as { rubricScores: { rubricCategory: { id: number }; score: number; judgeId: number }[] }).rubricScores as { rubricCategory: { id: number }; score: number; judgeId: number }[]).filter((s) => s.rubricCategory.id === ch.id);
          if (rows2.length === 0) continue;
          const avg = rows2.reduce((a, b) => a + b.score, 0) / rows2.length;
          sum += avg;
        }
        const yes = Math.round(sum * 10) / 10; // keep .5 from multi-judge
        return `${yes}/5`;
      });

      const row = [...base, ...qVals, ...yesCounts, ...parentWeighted, ...tail].map(csvEscape).join(',');
      lines.push(row);
    }

    const csv = [headers.map(csvEscape).join(','), ...lines].join('\n');
    const fname = `scores-${eventId}-${effectiveDept ?? 'all'}-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fname}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('scores export error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
