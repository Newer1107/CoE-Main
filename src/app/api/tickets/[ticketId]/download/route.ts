import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes } from '@/lib/api-helpers';
import { getObjectStat, getObjectStream } from '@/lib/minio';

// GET /api/tickets/[ticketId]/download
export async function GET(req: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);

    const { ticketId } = await params;
    const ticketModel = (prisma as any).ticket;
    const ticket = await ticketModel.findUnique({
      where: { ticketId },
      select: {
        ticketId: true,
        userId: true,
        pdfObjectKey: true,
      },
    });

    if (!ticket) return errorRes('Ticket not found', [], 404);

    const canAccess = ticket.userId === user.id || authorize(user, 'ADMIN', 'FACULTY');
    if (!canAccess) return errorRes('Forbidden', ['You cannot access this ticket'], 403);

    const [stream, stat] = await Promise.all([
      getObjectStream(ticket.pdfObjectKey),
      getObjectStat(ticket.pdfObjectKey).catch(() => null),
    ]);

    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const contentType =
      (stat?.metaData?.['content-type'] as string | undefined) ||
      (stat?.metaData?.['Content-Type'] as string | undefined) ||
      'application/pdf';

    return new Response(Buffer.concat(chunks), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${ticket.ticketId}.pdf"`,
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    });
  } catch (err) {
    console.error('Ticket download GET error:', err);
    return errorRes('Ticket download failed', [], 500);
  }
}
