import { getObjectStat, getObjectStream } from '@/lib/minio';
import { authenticate, errorRes } from '@/lib/api-helpers';
import prisma from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { Readable } from 'stream';

const PUBLIC_PATH_PATTERNS = [
  /^hero-slides\//,
  /^news\//,
  /^events\//,
  /^grants\//,
  // Public event/hackathon notice files stored directly under event root.
  // Example: innovation/events/12/1713150000000-notice.pdf
  /^innovation\/events\/\d+\/[^/]+$/,
  // Optional notice subfolder support for future public event docs.
  /^innovation\/events\/\d+\/notice\//,
  /^innovation\/open-problems\/\d+\/support\//,
  /^innovation\/events\/\d+\/problems\/\d+\/support\//,
  // Program notices are public by product requirement.
  // Allow all objects under innovation/programs to avoid false 401s across key variants.
  /^innovation\/programs\//,
];

const isPublicObjectKey = (objectKey: string) =>
  PUBLIC_PATH_PATTERNS.some((pattern) => pattern.test(objectKey));

const isStaff = (user: { role: string }) => user.role === 'ADMIN' || user.role === 'FACULTY';

/**
 * Ownership check for per-student objects. Keys are deterministic (they embed
 * userIds, claimIds or ticketIds), so any authenticated user could otherwise
 * harvest every team's decks, submissions, session documents and tickets.
 */
const canAccessObject = async (
  user: { id: number; role: string; uid?: string | null },
  objectKey: string
): Promise<boolean> => {
  if (isStaff(user)) return true;

  // certificates/{eventId}/{TYPE}/{serial}.pdf — serial embeds the userId
  if (objectKey.startsWith('certificates/')) {
    const serial = (objectKey.split('/').pop() ?? '').replace(/\.pdf$/, '');
    const certificate = await prisma.certificate.findUnique({
      where: { serial },
      select: { userId: true },
    });
    return !!certificate && certificate.userId === user.id;
  }

  // tickets/{year}/{month}/{ticketId}.pdf — ticket owner
  const ticketMatch = objectKey.match(/^tickets\/\d+\/\d+\/(.+)\.pdf$/);
  if (ticketMatch) {
    const ticket = await prisma.ticket.findUnique({
      where: { ticketId: decodeURIComponent(ticketMatch[1]) },
      select: { userId: true },
    });
    return !!ticket && ticket.userId === user.id;
  }

  // innovation/submissions/{claimId}/... and innovation/session-docs/{claimId}/... — claim member
  const claimMatch = objectKey.match(/^innovation\/(?:submissions|session-docs)\/(\d+)\//);
  if (claimMatch) {
    const member = await prisma.claimMember.findFirst({
      where: { claimId: Number(claimMatch[1]), userId: user.id },
      select: { id: true },
    });
    return !!member;
  }

  // innovation/events/{eventId}/registration/... — any member of a claim in the event
  const regMatch = objectKey.match(/^innovation\/events\/(\d+)\/registration\//);
  if (regMatch) {
    const member = await prisma.claimMember.findFirst({
      where: { userId: user.id, claim: { problem: { eventId: Number(regMatch[1]) } } },
      select: { id: true },
    });
    return !!member;
  }

  // Unmapped non-public paths keep the legacy rule: any authenticated user.
  return true;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    if (!path || path.length === 0) {
      return new Response('Not found', { status: 404 });
    }

    const objectKey = path.map((segment) => decodeURIComponent(segment)).join('/');
    let privateObject = false;

    if (!isPublicObjectKey(objectKey)) {
      const user = authenticate(req);
      if (!user) {
        return errorRes('Unauthorized', [], 401);
      }
      privateObject = true;
      if (!(await canAccessObject(user, objectKey))) {
        return errorRes('Forbidden', [], 403);
      }
    }

    const [stream, stat] = await Promise.all([
      getObjectStream(objectKey),
      getObjectStat(objectKey).catch(() => null),
    ]);

    const contentType =
      (stat?.metaData?.['content-type'] as string | undefined) ||
      (stat?.metaData?.['Content-Type'] as string | undefined) ||
      'application/octet-stream';

    const webStream = Readable.toWeb(stream as Readable) as ReadableStream;

    return new Response(webStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Private objects (per-student documents) must never be cached: a
        // reissued certificate or corrected submission would otherwise serve
        // stale content for up to an hour from CDN/browser caches.
        'Cache-Control': privateObject ? 'private, no-store' : 'public, max-age=3600',
      },
    });
  } catch (err) {
    console.error('Storage proxy error:', err);
    return new Response('Not found', { status: 404 });
  }
}
