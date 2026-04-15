import { getObjectStat, getObjectStream } from '@/lib/minio';
import { authenticate, errorRes } from '@/lib/api-helpers';
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

const isPublicObjectKey = (objectKey: string) => PUBLIC_PATH_PATTERNS.some((pattern) => pattern.test(objectKey));

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

    if (!isPublicObjectKey(objectKey)) {
      const user = authenticate(req);
      if (!user) {
        return errorRes('Unauthorized', [], 401);
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
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    console.error('Storage proxy error:', err);
    return new Response('Not found', { status: 404 });
  }
}
