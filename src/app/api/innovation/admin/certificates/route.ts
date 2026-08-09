import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { issueCertificatesForEvent, reissueCertificate } from '@/lib/certificate-issuance';

// GET /api/innovation/admin/certificates?eventId=&type=&search=
// POST /api/innovation/admin/certificates { action: 'issue', eventId, userId }
// POST /api/innovation/admin/certificates { action: 'reissue', certificateId, nameOverride }
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId') ? Number(searchParams.get('eventId')) : undefined;
    const type = searchParams.get('type') || undefined;
    const search = searchParams.get('search')?.trim() || undefined;
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const pageSize = Math.min(500, Math.max(1, Number(searchParams.get('pageSize') ?? '100') || 100));

    const where = {
      ...(eventId ? { eventId } : {}),
      ...(type ? { type } : {}),
      ...(search
        ? {
            OR: [
              { user: { name: { contains: search } } },
              { user: { uid: { contains: search } } },
              { serial: { contains: search } },
            ],
          }
        : {}),
    };

    const [certificates, total] = await Promise.all([
      prisma.certificate.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, uid: true } },
          event: { select: { id: true, title: true } },
        },
        orderBy: [{ eventId: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.certificate.count({ where }),
    ]);

    return successRes({ rows: certificates, total, page, pageSize }, 'Certificates retrieved successfully.');
  } catch (err) {
    console.error('Admin certificates GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

const issueSchema = z.object({
  action: z.literal('issue'),
  eventId: z.number().int().positive(),
  // Admin UI sends the student's UID (e.g. "24-COMPD14-28"); numeric userId is
  // also accepted for API clients that already resolved it.
  userId: z.number().int().positive().optional(),
  uid: z.string().trim().min(1).max(60).optional(),
}).superRefine((value, ctx) => {
  if (value.userId === undefined && !value.uid) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide uid or userId' });
  }
});

const reissueSchema = z.object({
  action: z.literal('reissue'),
  certificateId: z.number().int().positive(),
  nameOverride: z.string().trim().min(1).max(120).optional().nullable(),
});

const deleteSchema = z.object({
  action: z.literal('delete'),
  certificateId: z.number().int().positive(),
});

export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return errorRes('Invalid request body', [], 400);

    if (body.action === 'issue') {
      const parsed = issueSchema.safeParse(body);
      if (!parsed.success) return errorRes('Invalid issue payload', parsed.error.issues.map((i) => i.message), 400);

      let userId = parsed.data.userId;
      if (userId === undefined && parsed.data.uid) {
        const student = await prisma.user.findFirst({
          where: { uid: parsed.data.uid },
          select: { id: true, role: true },
        });
        if (!student) return errorRes('Student not found', [`No student with UID "${parsed.data.uid}"`], 404);
        if (student.role !== 'STUDENT') {
          return errorRes('Not a student', ['The given UID belongs to a non-student account'], 400);
        }
        userId = student.id;
      }

      // Restrict to what the student actually earned (top-3 achievement or present participation).
      const { created, skipped } = await issueCertificatesForEvent(prisma, parsed.data.eventId, {
        onlyUserIds: [userId as number],
      });

      if (created === 0 && skipped === 0) {
        return errorRes(
          'No certificate issued',
          ['This student is not eligible (not in a top-3 team and no PRESENT attendance record).'],
          400
        );
      }
      const message =
        created > 0
          ? `Certificate issued (${created} created, ${skipped} already present).`
          : 'Certificate already exists for this student.';
      return successRes({ created, skipped }, message);
    }

    if (body.action === 'reissue') {
      const parsed = reissueSchema.safeParse(body);
      if (!parsed.success) return errorRes('Invalid reissue payload', parsed.error.issues.map((i) => i.message), 400);

      const certificate = await reissueCertificate(prisma, parsed.data.certificateId, parsed.data.nameOverride);
      return successRes(certificate, 'Certificate reissued with updated name.');
    }

    if (body.action === 'delete') {
      const parsed = deleteSchema.safeParse(body);
      if (!parsed.success) return errorRes('Invalid delete payload', parsed.error.issues.map((i) => i.message), 400);

      const certificate = await prisma.certificate.findUnique({
        where: { id: parsed.data.certificateId },
        select: { id: true, fileKey: true },
      });
      if (!certificate) return errorRes('Certificate not found', [], 404);

      if (certificate.fileKey) {
        const { deleteFile } = await import('@/lib/minio');
        await deleteFile(certificate.fileKey).catch(() => null);
      }
      await prisma.certificate.delete({ where: { id: certificate.id } });
      return successRes({ deleted: true }, 'Certificate removed.');
    }

    return errorRes('Unknown action', [], 400);
  } catch (err) {
    console.error('Admin certificates POST error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return errorRes(message, [], 500);
  }
}
