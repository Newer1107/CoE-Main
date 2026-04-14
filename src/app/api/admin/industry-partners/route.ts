import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { industryPartnerCreateSchema } from '@/lib/validators';

// POST /api/admin/industry-partners
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const body = await req.json();
    const parsed = industryPartnerCreateSchema.safeParse(body);
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    const email = parsed.data.email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return errorRes('An account with this email already exists.', [], 409);
    }

    const hashedPassword = await bcrypt.hash(parsed.data.password, 12);

    const created = await prisma.user.create({
      data: {
        name: parsed.data.name.trim(),
        email,
        phone: parsed.data.phone?.trim() ? parsed.data.phone.trim() : null,
        password: hashedPassword,
        role: 'INDUSTRY_PARTNER',
        isVerified: true,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    return successRes(created, 'Industry partner account created successfully.', 201);
  } catch (err) {
    console.error('Admin industry partner POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
