import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';

// GET /api/hackathons/dashboard — student hackathon dashboard aggregation.
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const now = new Date();

    // All claims the student is a member of, with the linked problem + event.
    const claims = await prisma.claim.findMany({
      where: { members: { some: { userId: user.id } } },
      include: {
        problem: { include: { event: true } },
        members: { where: { userId: user.id }, select: { role: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const registeredEvents = claims
      .filter((claim) => claim.problem.event != null)
      .map((claim) => ({
        eventId: claim.problem.event!.id,
        title: claim.problem.event!.title,
        eventType: claim.problem.event!.eventType,
        status: claim.problem.event!.status,
        startTime: claim.problem.event!.startTime,
        endTime: claim.problem.event!.endTime,
        claimId: claim.id,
        claimStatus: claim.status,
        teamName: claim.teamName,
        myRole: claim.members[0]?.role ?? 'MEMBER',
      }));

    const upcomingDeadlines = registeredEvents
      .filter((event) => event.endTime > now)
      .sort((a, b) => a.endTime.getTime() - b.endTime.getTime());

    const acceptedClaims = claims.filter((claim) => claim.status === 'ACCEPTED' && claim.problem.event != null);

    // Certificates come from the issued Certificate table (achievement for top-3
    // teams, participation for present members) — not from raw accepted claims,
    // which would contradict the top-3 rule.
    const certificateRows = await prisma.certificate.findMany({
      where: { userId: user.id },
      include: { event: { select: { id: true, endTime: true } } },
      orderBy: [{ eventId: 'desc' }],
    });

    const certificates = certificateRows.map((certificate) => ({
      eventId: certificate.event.id,
      title: certificate.title,
      earnedAt: certificate.event.endTime.toISOString(),
      type: certificate.type,
      serial: certificate.serial,
    }));

    const recentResults = claims
      .filter((claim) => claim.finalScore != null && claim.problem.event != null)
      .slice(0, 10)
      .map((claim) => ({
        eventId: claim.problem.event!.id,
        title: claim.problem.event!.title,
        finalScore: claim.finalScore,
        claimStatus: claim.status,
        updatedAt: claim.updatedAt,
      }));

    const registeredEventIds = Array.from(
      new Set(registeredEvents.map((event) => event.eventId)),
    );

    const recommended = await prisma.hackathonEvent.findMany({
      where: {
        id: { notIn: registeredEventIds },
        status: { in: ['UPCOMING', 'ACTIVE'] },
        startTime: { gt: now },
      },
      orderBy: { startTime: 'asc' },
      take: 5,
      select: {
        id: true,
        title: true,
        eventType: true,
        startTime: true,
        endTime: true,
        status: true,
      },
    });

    return successRes(
      {
        registeredEvents,
        upcomingDeadlines,
        certificates,
        recentResults,
        recommended: recommended.map((event) => ({
          eventId: event.id,
          title: event.title,
          eventType: event.eventType,
          startTime: event.startTime,
          endTime: event.endTime,
          status: event.status,
        })),
      },
      'Hackathon dashboard retrieved successfully.',
    );
  } catch (err) {
    console.error('Hackathon dashboard GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
