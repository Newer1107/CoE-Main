import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';

const parseResourceId = (raw: string): number => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : NaN;
};

// DELETE /api/learning-resources/[id] — admin only
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { id } = await params;
    const resourceId = parseResourceId(id);
    if (Number.isNaN(resourceId)) return errorRes('Invalid resource id', [], 400);

    const existing = await prisma.learningResource.findUnique({ where: { id: resourceId } });
    if (!existing) return errorRes('Learning resource not found', [], 404);

    await prisma.learningResource.delete({ where: { id: resourceId } });
    return successRes(null, 'Learning resource deleted successfully.');
  } catch (err) {
    console.error('Learning resource DELETE error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
