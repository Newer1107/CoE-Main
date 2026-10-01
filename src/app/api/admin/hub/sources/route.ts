import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { ensureHubSources } from '@/lib/hub/sources';

// GET /api/admin/hub/sources — registry (§8)
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);
    await ensureHubSources();
    const rows = await (prisma as any).hubSource.findMany({ orderBy: { priority: 'desc' } });
    return successRes(rows, 'Sources retrieved.');
  } catch (err) {
    console.error('Hub sources GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// PATCH /api/admin/hub/sources — { key, enabled?, priority? }
export async function PATCH(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);
    const body = await req.json().catch(() => ({}));
    const key = typeof body.key === 'string' ? body.key : '';
    if (!key) return errorRes('Validation failed', ['key is required'], 400);
    const data: Record<string, unknown> = {};
    if (typeof body.enabled === 'boolean') data.enabled = body.enabled;
    if (Number.isInteger(body.priority)) data.priority = body.priority;
    if (Object.keys(data).length === 0) return errorRes('No fields to update', [], 400);
    const updated = await (prisma as any).hubSource.update({ where: { key }, data });
    return successRes(updated, 'Source updated.');
  } catch (err) {
    console.error('Hub sources PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
