import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { successRes, errorRes, authenticate, authorize } from '@/lib/api-helpers';
import { grantUpdateSchema } from '@/lib/validators';
import { deleteFile } from '@/lib/minio';

// PATCH /api/grants/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN', 'FACULTY')) return errorRes('Forbidden', [], 403);

    const { id } = await params;
    const body = await req.json();
    const parsed = grantUpdateSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((e: any) => e.message), 400);

    const updateData: Record<string, unknown> = { ...parsed.data };
    if (updateData.deadline) updateData.deadline = new Date(updateData.deadline as string);

    const grant = await prisma.grant.update({ where: { id: parseInt(id) }, data: updateData });
    return successRes(grant, 'Grant updated.');
  } catch (err) {
    console.error('Grant update error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// DELETE /api/grants/[id] — faculty/admin
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN', 'FACULTY')) return errorRes('Forbidden', [], 403);

    const { id } = await params;
    const grant = await prisma.grant.findUnique({ where: { id: parseInt(id) } });
    if (!grant) return errorRes('Grant not found.', [], 404);

    if (grant.attachmentKey) {
      try { await deleteFile(grant.attachmentKey); } catch { /* ignore */ }
    }

    await prisma.grant.delete({ where: { id: parseInt(id) } });
    return successRes(null, 'Grant deleted.');
  } catch (err) {
    console.error('Grant delete error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
