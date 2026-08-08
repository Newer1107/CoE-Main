import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { learningResourceSchema } from '@/lib/validators';

// GET /api/learning-resources — public browse
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const category = searchParams.get('category')?.trim() || undefined;
    const type = searchParams.get('type')?.trim() || undefined;
    const search = searchParams.get('search')?.trim() || undefined;

    const where = {
      ...(category ? { category } : {}),
      ...(type ? { type } : {}),
      ...(search ? { title: { contains: search } } : {}),
    };

    const resources = await prisma.learningResource.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return successRes(resources, 'Learning resources retrieved successfully.');
  } catch (err) {
    console.error('Learning resources GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// POST /api/learning-resources — admin only
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const body = await req.json();
    const parsed = learningResourceSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const data = parsed.data;
    const resource = await prisma.learningResource.create({
      data: {
        title: data.title,
        category: data.category,
        type: data.type,
        url: data.url || null,
        fileKey: data.fileKey || null,
        difficulty: data.difficulty || null,
        tags: data.tags && data.tags.length > 0 ? data.tags : undefined,
        createdById: user.id,
      },
    });

    return successRes(resource, 'Learning resource created successfully.', 201);
  } catch (err) {
    console.error('Learning resources POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
