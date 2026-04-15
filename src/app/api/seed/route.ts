import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { successRes, errorRes } from '@/lib/api-helpers';
import { NextRequest } from 'next/server';

const isAuthorizedSeedRequest = (req: NextRequest) => {
  const expectedSecret = process.env.SEED_SECRET?.trim();
  if (!expectedSecret) {
    return false;
  }

  const providedSecret = (req.headers.get('x-seed-secret') || req.nextUrl.searchParams.get('secret') || '').trim();
  return providedSecret === expectedSecret;
};

// POST /api/seed — seeds admin user from env vars (run once)
export async function POST(req: NextRequest) {
  try {
    if (!isAuthorizedSeedRequest(req)) {
      return errorRes('Forbidden', ['Invalid seed secret'], 403);
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminName = process.env.ADMIN_NAME;

    if (!adminEmail || !adminPassword || !adminName) {
      return errorRes('ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_NAME must be set in .env', [], 400);
    }

    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (existing) {
      return successRes(null, 'Admin user already exists.');
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    await prisma.user.create({
      data: {
        name: adminName,
        email: adminEmail.toLowerCase(),
        password: hashedPassword,
        role: 'ADMIN',
        isVerified: true,
        status: 'ACTIVE',
      },
    });

    return successRes(null, 'Admin user seeded successfully.', 201);
  } catch (err) {
    console.error('Seed error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
