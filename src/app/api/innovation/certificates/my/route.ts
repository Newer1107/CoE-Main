import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { getSignedUrl } from '@/lib/minio';

// GET /api/innovation/certificates/my
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const certificates = await prisma.certificate.findMany({
      where: { userId: user.id },
      include: { event: { select: { endTime: true } } },
      orderBy: [{ eventId: 'asc' }, { type: 'asc' }],
    });

    const rows = await Promise.all(
      certificates.map(async (certificate) => ({
        id: certificate.id,
        type: certificate.type,
        title: certificate.title,
        detail: certificate.detail,
        serial: certificate.serial,
        issuedAt: certificate.issuedAt.toISOString(),
        eventDate: certificate.event.endTime.toISOString(),
        downloadUrl: certificate.fileKey
          ? await getSignedUrl(certificate.fileKey).catch(() => null)
          : null,
      }))
    );

    return successRes(rows, 'Certificates retrieved successfully.');
  } catch (err) {
    console.error('Certificates my GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
