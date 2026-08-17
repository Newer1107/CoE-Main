import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';

// GET /api/faculty/mentored-projects — all hackathon claims where the logged-in user is the mentor
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);

    const claims = await prisma.claim.findMany({
      where: { mentor: user.email },
      select: {
        id: true,
        teamName: true,
        status: true,
        presentationScheduledAt: true,
        submissionFileKey: true,
        problem: {
          select: { id: true, title: true, event: { select: { id: true, title: true, status: true } } },
        },
        members: {
          include: { user: { select: { name: true, uid: true } } },
        },
      },
      orderBy: { id: 'desc' },
    });

    const projects = claims.filter((c): c is typeof c & { problem: NonNullable<typeof c.problem> } => !!c.problem).map((c) => ({
      claimId: c.id,
      teamName: c.teamName,
      status: c.status,
      hasPpt: !!c.submissionFileKey,
      presentationScheduledAt: c.presentationScheduledAt?.toISOString() ?? null,
      problemTitle: c.problem.title,
      eventId: c.problem!.event!.id,
      eventTitle: c.problem!.event!.title,
      eventStatus: c.problem!.event!.status,
      members: c.members.map((m) => ({
        name: m.user.name,
        uid: m.user.uid,
        role: m.role,
      })),
      memberCount: c.members.length,
    }));

    return successRes(projects, 'Mentored projects fetched');
  } catch (err) {
    console.error('mentored-projects error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
