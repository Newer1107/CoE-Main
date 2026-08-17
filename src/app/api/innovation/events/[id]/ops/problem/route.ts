import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent, coordinatorDepartments, deptFromUid } from '@/lib/hackathon-ops';
import { createNotifications } from '@/lib/notifications';

// PUT /api/innovation/events/[id]/ops/problem
// Coordinator: change a team's problem statement.
//   { claimId: number, problemId: number }
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
        status: true,
        coordinatorId: true,
        coordinators: { select: { userId: true, departmentCode: true } },
        config: true,
      },
    });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);
    if (event.status === 'CLOSED') return errorRes('Event is closed', ['Problem statements cannot change after close'], 400);

    const body = (await req.json().catch(() => null)) as { claimId?: number; problemId?: number; customTitle?: string; customDescription?: string } | null;
    if (!body || !Number.isInteger(body.claimId)) return errorRes('claimId is required', [], 400);
    if (!body.problemId && !body.customTitle) return errorRes('Provide problemId or a custom Open Innovation title+description', [], 400);
    if (body.problemId && body.customTitle) return errorRes('Provide either problemId or custom fields, not both', [], 400);

    const claim = await prisma.claim.findUnique({
      where: { id: body.claimId },
      include: {
        problem: { select: { id: true, title: true, eventId: true } },
        members: { select: { userId: true, role: true, user: { select: { uid: true } } } },
      },
    });
    if (!claim || claim.problem?.eventId !== eventId) return errorRes('Claim not found for this event', [], 404);
    if (user.role !== 'ADMIN') {
      const allowedDepts = coordinatorDepartments(user.id, event);
      if (allowedDepts !== null) {
        const lead = (claim as unknown as { members: { role: string; user: { uid: string | null } }[] }).members.find((m) => m.role === 'LEAD');
        if (!lead || !allowedDepts.includes(deptFromUid(lead.user.uid) ?? '')) return errorRes('Not allowed for this department', ['You can only manage teams from your department'], 403);
      }
    }

    let targetProblemId: number;

    if (body.problemId) {
      const problem = await prisma.problem.findFirst({ where: { id: body.problemId, eventId } });
      if (!problem) return errorRes('Problem statement not found for this event', [], 404);
      targetProblemId = problem.id;
    } else {
      // Open Innovation: create an isCustom problem
      const cfg = (event.config as { registration?: Record<string, unknown> } | null)?.registration ?? {};
      if (!cfg.allowOpenInnovation) return errorRes('Open Innovation not enabled', ['This event does not allow custom problem statements'], 400);
      const title = (body.customTitle ?? '').trim();
      const description = (body.customDescription ?? '').trim();
      if (title.length < 20 || title.length > 180) return errorRes('Title must be 20–180 characters', [], 400);
      if (description.length < 50 || description.length > 2000) return errorRes('Description must be 50–2000 characters', [], 400);

      const newProblem = await prisma.problem.create({
        data: { eventId, title, description, isCustom: true, createdById: user.id },
      });
      targetProblemId = newProblem.id;
    }

    await prisma.claim.update({ where: { id: claim.id }, data: { problemId: targetProblemId } });

    const memberIds = claim.members.map((m) => m.userId);
    const newTitle = body.problemId ? undefined : body.customTitle!.trim();
    if (memberIds.length > 0) {
      await createNotifications(
        memberIds.map((userId) => ({
          userId,
          type: 'EVENT_UPDATE' as const,
          title: `Problem statement changed — ${event.title}`,
          body: newTitle
            ? `Your team has been assigned an Open Innovation problem: ${newTitle}`
            : `Your team's problem statement has been updated.`,
        }))
      );
    }

    return successRes(
      { claimId: claim.id, problemId: targetProblemId, title: newTitle ?? null },
      body.problemId ? 'Problem statement changed — team notified' : 'Open Innovation PS created and assigned — team notified'
    );
  } catch (err) {
    console.error('problem change error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
