import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { successRes, errorRes } from '@/lib/api-helpers';
import { facultyRegisterSchema } from '@/lib/validators';
import { sendFacultyPendingNotification } from '@/lib/mailer';
import { logActivity } from '@/lib/activity-log';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = facultyRegisterSchema.safeParse(body);
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((e: any) => e.message), 400);
    }

    const { name, email, phone, password } = parsed.data;
    logActivity('AUTH_REGISTER_FACULTY_ATTEMPT', {
      email: email.toLowerCase(),
    });

    if (email === process.env.ADMIN_EMAIL) {
      logActivity('AUTH_REGISTER_FACULTY_REJECTED', {
        email: email.toLowerCase(),
        reason: 'ADMIN_EMAIL_RESERVED',
      });
      return errorRes('This email is reserved for the administrator.', [], 403);
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      logActivity('AUTH_REGISTER_FACULTY_REJECTED', {
        email: email.toLowerCase(),
        reason: 'EMAIL_EXISTS',
      });
      return errorRes('An account with this email already exists.', [], 409);
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const createdUser = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        phone,
        password: hashedPassword,
        role: 'FACULTY',
        isVerified: true,
        status: 'PENDING',
      },
    });
    logActivity('AUTH_REGISTER_FACULTY_CREATED', {
      userId: createdUser.id,
      email: createdUser.email,
      status: createdUser.status,
    });

    // Notify admin
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      try {
        await sendFacultyPendingNotification(adminEmail, { name, email });
        logActivity('AUTH_REGISTER_FACULTY_ADMIN_NOTIFIED', {
          facultyEmail: email.toLowerCase(),
          adminEmail,
        });
      } catch (emailErr) {
        console.error('Admin notification email failed:', emailErr);
        logActivity('AUTH_REGISTER_FACULTY_ADMIN_NOTIFY_FAILED', {
          facultyEmail: email.toLowerCase(),
          adminEmail,
        });
      }
    }

    return successRes(null, 'Faculty registration submitted. Pending admin approval.', 201);
  } catch (err) {
    console.error('Faculty register error:', err);
    logActivity('AUTH_REGISTER_FACULTY_ERROR', {
      error: err instanceof Error ? err.message : 'UNKNOWN_ERROR',
    });
    return errorRes('Internal server error', [], 500);
  }
}
