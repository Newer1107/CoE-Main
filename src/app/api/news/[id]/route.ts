import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { successRes, errorRes, authenticate, authorize } from '@/lib/api-helpers';
import { newsUpdateSchema } from '@/lib/validators';
import { deleteFile } from '@/lib/minio';

// PATCH /api/news/[id] — faculty/admin edits title/caption
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN', 'FACULTY')) return errorRes('Forbidden', [], 403);

    const { id } = await params;
    const body = await req.json();
    const parsed = newsUpdateSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((e: any) => e.message), 400);

    const post = await prisma.newsPost.update({
      where: { id: parseInt(id) },
      data: parsed.data,
    });

    return successRes(post, 'News post updated.');
  } catch (err) {
    console.error('News update error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// DELETE /api/news/[id] — faculty/admin
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN', 'FACULTY')) return errorRes('Forbidden', [], 403);

    const { id } = await params;
    const post = await prisma.newsPost.findUnique({ where: { id: parseInt(id) } });
    if (!post) return errorRes('News post not found.', [], 404);

    // Delete from MinIO
    try { await deleteFile(post.imageKey); } catch { /* ignore */ }

    await prisma.newsPost.delete({ where: { id: parseInt(id) } });
    return successRes(null, 'News post deleted.');
  } catch (err) {
    console.error('News delete error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
