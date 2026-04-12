import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { committeeCreateEvaluatorSchema } from '@/lib/committee-validators';

// POST /api/committee/admin/evaluators
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const body = await req.json();
    const parsed = committeeCreateEvaluatorSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const email = parsed.data.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);

    const created = await prisma.user.create({
      data: {
        name: parsed.data.name.trim(),
        email,
        password: passwordHash,
        role: 'EVALUATOR',
        isVerified: true,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return successRes(created, 'Evaluator account created successfully.', 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return errorRes('Evaluator already exists', ['Email is already in use.'], 409);
    }

    console.error('Committee evaluator POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
