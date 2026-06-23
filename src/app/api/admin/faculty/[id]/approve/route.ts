import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { successRes, errorRes, authenticate, authorize } from '@/lib/api-helpers';
import { sendFacultyApprovalEmail } from '@/lib/mailer';
import { syncDashboardUser } from '@/lib/dashboard-sync';

// PATCH /api/admin/faculty/[id]/approve
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', [], 403);

    const { id } = await params;
    const faculty = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!faculty) return errorRes('User not found.', [], 404);
    if (faculty.role !== 'FACULTY') return errorRes('User is not faculty.', [], 400);
    if (faculty.status !== 'PENDING') return errorRes('User is not in pending status.', [], 400);

    await prisma.user.update({
      where: { id: parseInt(id) },
      data: { status: 'ACTIVE' },
    });

    try {
      await sendFacultyApprovalEmail(faculty.email, faculty.name);
    } catch (emailErr) {
      console.error('Faculty approval email failed:', emailErr);
    }

    syncDashboardUser({
      email: faculty.email,
      name: faculty.name,
      role: faculty.role,
      uid: faculty.uid,
      status: 'ACTIVE',
      isActive: true,
    });

    return successRes(null, 'Faculty account approved.');
  } catch (err) {
    console.error('Faculty approve error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
