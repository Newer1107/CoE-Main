import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { industryPartnerCreateSchema } from '@/lib/validators';

const normalizeIndustryName = (value: string) => {
  return value.trim().replace(/\s+/g, ' ');
};

const ensureIndustry = async (industryId: number | undefined, industryNameRaw: string | undefined) => {
  if (typeof industryId === 'number') {
    const existing = await prisma.industry.findUnique({ where: { id: industryId } });
    if (!existing) {
      throw new Error('Selected industry does not exist.');
    }
    return existing;
  }

  const normalizedName = normalizeIndustryName(industryNameRaw || '');
  if (!normalizedName) {
    throw new Error('Industry name is required.');
  }

  const existingByName = await prisma.industry.findUnique({ where: { name: normalizedName } });
  if (existingByName) return existingByName;

  return prisma.industry.create({
    data: {
      name: normalizedName,
    },
  });
};

// GET /api/admin/industry-partners
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const industries = await prisma.industry.findMany({
      include: {
        users: {
          where: {
            role: 'INDUSTRY_PARTNER',
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
          orderBy: {
            createdAt: 'desc',
          },
        },
        _count: {
          select: {
            users: true,
            problems: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return successRes(industries, 'Industry directory retrieved.');
  } catch (err) {
    console.error('Admin industry partner GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

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
    const targetIndustry = await ensureIndustry(parsed.data.industryId, typeof parsed.data.industryName === 'string' ? parsed.data.industryName : undefined);
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      const updatedExistingUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          role: 'INDUSTRY_PARTNER',
          industryId: targetIndustry.id,
          status: 'ACTIVE',
          isVerified: true,
          name: parsed.data.name?.trim() || existingUser.name,
          phone: typeof parsed.data.phone === 'string' && parsed.data.phone.trim().length > 0
            ? parsed.data.phone.trim()
            : existingUser.phone,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          createdAt: true,
          industry: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return successRes(updatedExistingUser, 'Existing user assigned to industry successfully.', 200);
    }

    if (!parsed.data.name || parsed.data.name.trim().length < 2) {
      return errorRes('Validation failed', ['Name is required when creating a new industry partner account'], 400);
    }

    if (!parsed.data.password || parsed.data.password.length < 6) {
      return errorRes('Validation failed', ['Password is required when creating a new industry partner account'], 400);
    }

    const hashedPassword = await bcrypt.hash(parsed.data.password, 12);

    const created = await prisma.user.create({
      data: {
        name: parsed.data.name.trim(),
        email,
        phone: parsed.data.phone?.trim() ? parsed.data.phone.trim() : null,
        password: hashedPassword,
        role: 'INDUSTRY_PARTNER',
        industryId: targetIndustry.id,
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
        industry: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return successRes(created, 'Industry partner account created successfully.', 201);
  } catch (err) {
    console.error('Admin industry partner POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
