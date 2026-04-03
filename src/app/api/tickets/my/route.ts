import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';

// GET /api/tickets/my
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT', 'FACULTY', 'ADMIN')) return errorRes('Forbidden', [], 403);

    const tickets = await prisma.ticket.findMany({
      where: { userId: user.id },
      orderBy: { issuedAt: 'desc' },
      select: {
        ticketId: true,
        type: true,
        status: true,
        title: true,
        subjectName: true,
        scheduledAt: true,
        issuedAt: true,
        usedAt: true,
      },
    });

    const payload = tickets.map((ticket) => ({
      ...ticket,
      downloadUrl: `/api/tickets/${encodeURIComponent(ticket.ticketId)}/download`,
    }));

    return successRes(payload, 'Tickets retrieved successfully.');
  } catch (err) {
    console.error('Tickets my GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
