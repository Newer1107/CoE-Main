import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { logActivity } from '@/lib/activity-log';

// PATCH /api/tickets/[ticketId]/cancel
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN', 'FACULTY')) return errorRes('Forbidden', ['Admin or faculty access required'], 403);

    const { ticketId } = await params;
    const ticketModel = (prisma as any).ticket;

    const ticket = await ticketModel.findUnique({
      where: { ticketId },
      select: { id: true, ticketId: true, status: true, userId: true, type: true },
    });

    if (!ticket) return errorRes('Ticket not found', [], 404);
    if (ticket.status === 'CANCELLED') return successRes(ticket, 'Ticket already cancelled.');

    const updated = await ticketModel.update({
      where: { ticketId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
      select: {
        ticketId: true,
        status: true,
        cancelledAt: true,
        userId: true,
        type: true,
      },
    });

    logActivity('TICKET_CANCELLED', {
      ticketId: updated.ticketId,
      ticketUserId: updated.userId,
      type: updated.type,
      cancelledBy: user.id,
    });

    return successRes(updated, 'Ticket cancelled successfully.');
  } catch (err) {
    console.error('Ticket cancel PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
