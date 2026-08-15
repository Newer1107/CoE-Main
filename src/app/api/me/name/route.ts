import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { logActivity } from '@/lib/activity-log';

const NAME_RE = /^[A-Za-z][A-Za-z .'-]{1,79}$/;

// PUT /api/me/name — one-time student name change; locked forever after use.
export async function PUT(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const body = (await req.json().catch(() => null)) as { name?: string } | null;
    const raw = (body?.name ?? '').trim();
    if (raw.length < 2 || raw.length > 80 || !NAME_RE.test(raw)) {
      return errorRes('Invalid name', ['Enter a valid name (2–80 characters, letters only)'], 400);
    }

    const row = await prisma.user.findUnique({ where: { id: user.id }, select: { nameChangedAt: true, name: true } });
    if (!row) return errorRes('User not found', [], 404);
    if (row.nameChangedAt) {
      return errorRes(
        'Name change already used',
        [`You changed your name on ${row.nameChangedAt.toLocaleDateString('en-IN')} — the one-time name change is locked forever.`],
        403,
      );
    }
    if (raw === row.name) {
      return errorRes('Name unchanged', ['Your name is already “' + row.name + '”'], 400);
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { name: raw, nameChangedAt: new Date() },
      select: { name: true, nameChangedAt: true },
    });

    logActivity('STUDENT_NAME_CHANGED', {
      userId: user.id,
      from: row.name,
      to: updated.name,
    });

    return successRes(
      { name: updated.name, nameChangedAt: updated.nameChangedAt?.toISOString() ?? null },
      'Name updated — this was your one-time name change and it is now locked forever.'
    );
  } catch (err) {
    console.error('name change error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
