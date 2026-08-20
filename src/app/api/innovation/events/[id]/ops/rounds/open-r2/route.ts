import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { canManageEvent, opsConfig, coordinatorDepartments, deptFromUid } from '@/lib/hackathon-ops';
import { issueCertificatesForEvent } from '@/lib/certificate-issuance';
import { createNotifications } from '@/lib/notifications';
import { sendPresentationScheduledEmail } from '@/lib/mailer';

// POST /api/innovation/events/[id]/ops/rounds/open-r2 — open Phase 2, notify advanced teams
// { round2StartAt?: string(ISO), round2EndAt?: string(ISO) }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const eventId = Number((await params).id);
    const event = await prisma.hackathonEvent.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, status: true, coordinatorId: true, coordinators: { select: { userId: true } }, config: true },
    });
    if (!event) return errorRes('Event not found', [], 404);
    if (!canManageEvent(user, event)) return errorRes('Coordinator access required', [], 403);

    const cfg = opsConfig(event);
    const body = await req.json().catch(() => ({}));
    const r2Dept = (body?.dept ?? '').toString().trim().toUpperCase();
    if (!r2Dept) return errorRes('dept is required', [], 400);
    const byDeptR1 = cfg.round1DeclaredByDept ?? {};
    if (!byDeptR1[r2Dept]) return errorRes(`${r2Dept} Round 1 not declared yet`, [], 400);
    const r2ByDept = { ...(cfg.r2ByDept ?? {}) };
    if (r2ByDept[r2Dept]?.status === 'open') return errorRes(`${r2Dept} Round 2 already open`, [], 409);

    const round2StartAt = body.round2StartAt ? new Date(body.round2StartAt) : null;
    const round2EndAt = body.round2EndAt ? new Date(body.round2EndAt) : null;
    if (round2StartAt && round2StartAt < new Date()) return errorRes('Start time is in the past', [], 400);
    if (round2EndAt && round2StartAt && round2EndAt <= round2StartAt) return errorRes('End time must be after start time', [], 400);

    // Save Round 2 timing + open it in config
    const config = {
      ...((event.config ?? {}) as Record<string, unknown>),
      ops: { ...cfg, currentRound: Math.max(cfg.currentRound ?? 1, 2), judgeRounds: Math.max(cfg.judgeRounds ?? 1, 2), r2ByDept: { ...r2ByDept, [r2Dept]: { status: 'open', startAt: round2StartAt?.toISOString() ?? null, endAt: round2EndAt?.toISOString() ?? null, declaredAt: null } } },
        startAt: round2StartAt?.toISOString() ?? null,
        endAt: round2EndAt?.toISOString() ?? null,

    };
    await prisma.hackathonEvent.update({ where: { id: eventId }, data: { config } });

    // Notify SHORTLISTED teams in this dept
    const shortlisted = await prisma.claim.findMany({
      where: { status: 'SHORTLISTED' as any, problem: { eventId }, round2VenueId: { not: null } },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        venue: { select: { name: true } },
        round2Venue: { select: { name: true } },
      },
    });

    for (const claim of shortlisted) {
      const memberIds = claim.members.map((m) => m.userId);
      const venueName = claim.round2Venue?.name ?? claim.venue?.name ?? 'TBA';
      const startStr = round2StartAt
        ? round2StartAt.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
        : 'TBA';
      if (memberIds.length > 0) {
        await createNotifications(
          memberIds.map((userId) => ({
            userId,
            type: 'EVENT_UPDATE' as const,
            title: `Round 2 — ${event.title}`,
            body: `Your team (${claim.teamName ?? '—'}) has been selected for Round 2. Venue: ${venueName}, Starts: ${startStr}.`,
          }))
        );
      }
      const lead = claim.members.find((m) => m.role === 'LEAD');
      if (lead) {
        await sendPresentationScheduledEmail(lead.user.email, {
          teamName: claim.teamName,
          eventTitle: event.title,
          scheduledAt: round2StartAt ?? new Date(),
          venueName,
        }).catch(() => null);
      }
    }

    // Issue Round 1 participation certificates for SHORTLISTED teams
    const shortlistedUserIds = shortlisted.flatMap((c) => c.members.map((m) => m.userId));
    if (shortlistedUserIds.length > 0) {
      await issueCertificatesForEvent(prisma, eventId, { onlyUserIds: shortlistedUserIds, onlyMissing: true })
        .catch((e) => console.error('R1 cert issuance failed:', e));
    }

    return successRes({ round: 2, notified: shortlisted.length, r1CertsIssued: shortlistedUserIds.length }, `Round 2 opened — ${shortlisted.length} team(s) notified, R1 certs issued`);
  } catch (err) {
    console.error('rounds open-r2 error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
