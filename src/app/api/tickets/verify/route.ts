import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { verifyAndConsumeTicket } from '@/lib/tickets';

const verifyTicketSchema = z.object({
  ticketId: z.string().trim().min(8, 'ticketId is required'),
});

// POST /api/tickets/verify
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN', 'FACULTY')) return errorRes('Forbidden', ['Admin or faculty access required'], 403);

    const body = await req.json();
    const parsed = verifyTicketSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const result = await verifyAndConsumeTicket(parsed.data.ticketId, user.id);

    if (!result.ok) {
      if (result.code === 'NOT_FOUND') return errorRes('Ticket not found', [], 404);
      if (result.code === 'CANCELLED') return errorRes('Ticket is cancelled', [], 400);
      if (result.code === 'ALREADY_USED') return errorRes('Ticket already used', [], 409);
      return errorRes('Ticket verification failed', [], 400);
    }

    return successRes(
      {
        ticketId: result.ticket.ticketId,
        status: result.ticket.status,
        usedAt: result.ticket.usedAt,
        user: result.ticket.user,
        title: result.ticket.title,
        subjectName: result.ticket.subjectName,
      },
      'Ticket verified successfully.'
    );
  } catch (err) {
    console.error('Ticket verify POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
