import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { markHackathonTeamMembersPresent, verifyAndConsumeTicket, verifyTicketForCheckIn } from '@/lib/tickets';

const verifyTicketSchema = z.object({
  ticketId: z.string().trim().min(8, 'ticketId is required'),
  presentClaimMemberIds: z.array(z.coerce.number().int().positive()).optional(),
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

    const verification = await verifyTicketForCheckIn(parsed.data.ticketId);

    if (!verification.ok) {
      if (verification.code === 'NOT_FOUND') return errorRes('Ticket not found', [], 404);
      if (verification.code === 'CANCELLED') return errorRes('Ticket is cancelled', [], 400);
      return errorRes('Ticket verification failed', [], 400);
    }

    if (verification.mode === 'FACILITY') {
      const result = await verifyAndConsumeTicket(parsed.data.ticketId, user.id);

      if (!result.ok) {
        if (result.code === 'NOT_FOUND') return errorRes('Ticket not found', [], 404);
        if (result.code === 'CANCELLED') return errorRes('Ticket is cancelled', [], 400);
        if (result.code === 'ALREADY_USED') return errorRes('Ticket already used', [], 409);
        return errorRes('Ticket verification failed', [], 400);
      }

      return successRes(
        {
          mode: 'FACILITY',
          ticketId: result.ticket.ticketId,
          status: result.ticket.status,
          usedAt: result.ticket.usedAt,
          user: result.ticket.user,
          title: result.ticket.title,
          subjectName: result.ticket.subjectName,
        },
        'Facility ticket verified successfully.'
      );
    }

    if (parsed.data.presentClaimMemberIds && parsed.data.presentClaimMemberIds.length > 0) {
      const marked = await markHackathonTeamMembersPresent(
        parsed.data.ticketId,
        parsed.data.presentClaimMemberIds,
        user.id
      );

      if (!marked.ok) {
        if (marked.code === 'NOT_FOUND') return errorRes('Ticket not found', [], 404);
        if (marked.code === 'CANCELLED') return errorRes('Ticket is cancelled', [], 400);
        return errorRes('Ticket attendance update failed', [], 400);
      }

      return successRes(
        {
          mode: 'HACKATHON',
          ticketId: marked.ticket.ticketId,
          status: marked.ticket.status,
          title: marked.ticket.title,
          subjectName: marked.ticket.subjectName,
          teamName: marked.teamName,
          eventName: marked.eventName,
          claimId: marked.claimId,
          presentCount: marked.presentCount,
          totalMembers: marked.totalMembers,
          newlyMarkedCount: marked.newlyMarkedCount,
          members: marked.members,
        },
        'Team attendance updated successfully.'
      );
    }

    return successRes(
      {
        mode: 'HACKATHON',
        ticketId: verification.ticket.ticketId,
        status: verification.ticket.status,
        title: verification.ticket.title,
        subjectName: verification.ticket.subjectName,
        teamName: verification.teamName,
        eventName: verification.eventName,
        claimId: verification.claimId,
        presentCount: verification.presentCount,
        totalMembers: verification.totalMembers,
        members: verification.members,
      },
      'Hackathon team ticket verified. Select present members to check in.'
    );
  } catch (err) {
    console.error('Ticket verify POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
