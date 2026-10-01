import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { ensureHubSources } from '@/lib/hub/sources';

// GET /api/admin/hub/candidates?status=NEEDS_REVIEW,VERIFIED — review queue (§18, §40)
// status accepts a comma-separated list; omit for all rows.
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);
    const raw = req.nextUrl.searchParams.get('status')?.trim().toUpperCase() || '';
    const statuses = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const rows = await (prisma as any).hubCandidate.findMany({
      where: statuses.length > 0 ? { status: { in: statuses } } : {},
      orderBy: { discoveredAt: 'desc' },
      take: 100,
    });
    return successRes(rows, 'Candidates retrieved.');
  } catch (err) {
    console.error('Hub candidates GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// POST /api/admin/hub/candidates — manually add a candidate URL (reliable path)
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);
    const body = await req.json().catch(() => ({}));
    const url = typeof body.url === 'string' ? body.url.trim().slice(0, 512) : '';
    if (!/^https:\/\//.test(url)) return errorRes('Validation failed', ['url must be an https URL'], 400);
    await ensureHubSources();
    const existing = await (prisma as any).hubCandidate.findUnique({ where: { url } });
    if (existing) return successRes(existing, 'Candidate already tracked.');
    const created = await (prisma as any).hubCandidate.create({
      data: {
        url,
        source: typeof body.source === 'string' && body.source ? body.source : 'admin',
        sourceType: typeof body.sourceType === 'string' && body.sourceType ? body.sourceType : 'ADMIN',
        status: 'DISCOVERED',
        title: typeof body.title === 'string' ? body.title.slice(0, 200) : null,
      },
    });
    return successRes(created, 'Candidate added.', 201);
  } catch (err) {
    console.error('Hub candidates POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
