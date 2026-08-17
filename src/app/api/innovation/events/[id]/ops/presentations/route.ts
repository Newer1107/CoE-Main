import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent, coordinatorDepartments, deptFromUid } from '@/lib/hackathon-ops';
import { createNotifications } from '@/lib/notifications';
import { sendPresentationScheduledEmail } from '@/lib/mailer';

// PUT /api/innovation/events/[id]/ops/presentations
// Coordinator: set or clear a team's presentation slot.
//   { claimId: number, scheduledAt: string(ISO) | null }
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    if (!Number.isInteger(eventId)) return errorRes('Invalid event id', [], 400);

    const event = await prisma.hackathonEvent.findUnique({
      where: { id: eventId },
      select: {
        title: true,
        coordinatorId: true,
        coordinators: { select: { userId: true, departmentCode: true } },
      },
    });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);

    const body = (await req.json().catch(() => null)) as { claimId?: number; scheduledAt?: string | null } | null;
    if (!body || !Number.isInteger(body.claimId)) return errorRes('claimId is required', [], 400);

    const claim = await prisma.claim.findUnique({
      where: { id: body.claimId },
      include: {
        problem: { select: { eventId: true } },
        members: { select: { userId: true, role: true, user: { select: { email: true, name: true, uid: true } } } },
        venue: { select: { name: true } },
      },
    });
    if (!claim || claim.problem?.eventId !== eventId) {
      return errorRes('Claim not found for this event', [], 404);
    }
    if (user.role !== 'ADMIN') {
      const allowedDepts = coordinatorDepartments(user.id, event);
      if (allowedDepts !== null) {
        const lead = (claim as unknown as { members: { role: string; user: { uid: string | null } }[] }).members.find((m) => m.role === 'LEAD');
        if (!lead || !allowedDepts.includes(deptFromUid(lead.user.uid) ?? '')) return errorRes('Not allowed for this department', ['You can only manage teams from your department'], 403);
      }
    }

    let scheduledAt: Date | null = null;
    if (body.scheduledAt !== null && body.scheduledAt !== undefined) {
      scheduledAt = new Date(body.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) return errorRes('Invalid scheduledAt', [], 400);
    }

    await prisma.claim.update({
      where: { id: claim.id },
      data: { presentationScheduledAt: scheduledAt },
    });

    // notify every team member (in-app) + email the lead
    const memberIds = claim.members.map((m) => m.userId);
    const lead = claim.members.find((m) => m.role === 'LEAD');
    if (memberIds.length > 0) {
      await createNotifications(
        memberIds.map((userId) => ({
          userId,
          type: 'EVENT_UPDATE' as const,
          title: scheduledAt
            ? `Presentation slot scheduled — ${event.title}`
            : `Presentation slot cleared — ${event.title}`,
          body: scheduledAt
            ? `Your team (${claim.teamName ?? '—'}) presents on ${scheduledAt.toLocaleString('en-IN', {
                dateStyle: 'full',
                timeStyle: 'short',
              })}${claim.venue ? ` at ${claim.venue.name}` : ''}.`
            : `Your team's presentation slot for ${event.title} was cleared. Contact the coordinator.`,
        }))
      );
    }
    if (scheduledAt && lead) {
      await sendPresentationScheduledEmail(lead.user.email, {
        teamName: claim.teamName,
        eventTitle: event.title,
        scheduledAt,
        venueName: claim.venue?.name ?? null,
      }).catch(() => null);
    }

    return successRes(
      { claimId: claim.id, scheduledAt: scheduledAt ? scheduledAt.toISOString() : null },
      scheduledAt ? 'Presentation slot set — team notified' : 'Presentation slot cleared'
    );
  } catch (err) {
    console.error('presentation slot error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
