import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { successRes, errorRes, authenticate, authorize } from '@/lib/api-helpers';
import bcrypt from 'bcryptjs';

// GET /api/admin/users — list all users with optional role/status filter
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', [], 403);

    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (role) where.role = role.toUpperCase();
    if (status) where.status = status.toUpperCase();

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true, name: true, email: true, phone: true, role: true, uid: true,
        isVerified: true, status: true, createdAt: true,
        facultyProfile: { select: { isHod: true, department: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return successRes(users, 'Users retrieved.');
  } catch (err) {
    console.error('Admin users error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// POST /api/admin/users — create a user account (admin only)
// { name, email, role: STUDENT|FACULTY, password, uid?, phone? }
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (user.role !== 'ADMIN') return errorRes('Admins only', [], 403);

    const body = await req.json().catch(() => null);
    const name = ((body?.name ?? '') as string).trim().slice(0, 120);
    const email = ((body?.email ?? '') as string).trim().toLowerCase();
    const role = String(body?.role ?? '').toUpperCase();
    const password = String(body?.password ?? '');
    const uid = body?.uid ? String(body.uid).trim().toUpperCase().slice(0, 40) : null;
    const phone = body?.phone ? String(body.phone).trim().slice(0, 20) : null;

    if (!name || !email) return errorRes('Name and email are required', [], 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errorRes('Invalid email', [], 400);
    if (!['STUDENT', 'FACULTY'].includes(role)) return errorRes('Invalid role', ['Role must be STUDENT or FACULTY'], 400);
    if (password.length < 8) return errorRes('Weak password', ['Password must be at least 8 characters'], 400);

    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) return errorRes('Email already registered', [`${email} already has an account`], 409);

    if (uid) {
      const uidTaken = await prisma.user.findFirst({ where: { uid } });
      if (uidTaken) {
        return errorRes('UID already registered', [`${uid} already belongs to ${uidTaken.name} (${uidTaken.email})`], 409);
      }
    }

    const hash = await bcrypt.hash(password, 10);
    const created = await prisma.user.create({
      data: { name, email, password: hash, role: role as 'STUDENT' | 'FACULTY', uid, phone, isVerified: true, status: 'ACTIVE' },
      select: { id: true, name: true, email: true, role: true, uid: true },
    });
    return successRes({ user: created }, 'Account created', 201);
  } catch (err) {
    console.error('admin create-user error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
