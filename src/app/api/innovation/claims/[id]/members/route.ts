import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { deriveStudentInfo } from '@/lib/student-info';

// PUT /api/innovation/claims/[id]/members — team lead edits the member list.
//   { memberUids: string[] } (member UIDs only; the lead is never in this array)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const claimId = Number((await params).id);
    if (!Number.isInteger(claimId)) return errorRes('Invalid claim id', [], 400);

    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      include: {
        problem: { select: { eventId: true } },
        members: { include: { user: { select: { id: true, uid: true, name: true, email: true } } } },
      },
    });
    if (!claim) return errorRes('Claim not found', [], 404);

    const event = await prisma.hackathonEvent.findUnique({
      where: { id: claim.problem?.eventId ?? 0 },
      select: { id: true, status: true, registrationOpen: true, submissionLockAt: true, config: true },
    });
    if (!event) return errorRes('Event not found', [], 404);

    // leader-only
    const leadRow = claim.members.find((m) => m.role === 'LEAD');
    if (!leadRow || leadRow.userId !== user.id) return errorRes('Only the team lead can edit members', [], 403);
    if (!leadRow.user.uid) return errorRes('Team lead UID missing', [], 400);

    // window gate (same as the PPT re-upload)
    if (event.status === 'CLOSED' || (event.status !== 'UPCOMING' && event.status !== 'ACTIVE')) {
      return errorRes('Registration window closed', ['Members can only change while the event is UPCOMING or ACTIVE'], 400);
    }
    if (event.submissionLockAt && new Date(event.submissionLockAt) <= new Date()) {
      return errorRes('Submission window closed', ['The submission deadline has passed'], 400);
    }

    const body = (await req.json().catch(() => null)) as { memberUids?: unknown } | null;
    if (!body || !Array.isArray(body.memberUids)) return errorRes('memberUids (array) is required', [], 400);

    const regCfg = (event.config as { registration?: Record<string, unknown> } | null)?.registration ?? {};
    const maxTeamSize = Number(regCfg.maxTeamSize ?? 6);
    const minTeamSize = Number(regCfg.minTeamSize ?? 2);

    const memberUids = Array.from(new Set(body.memberUids.map((u) => String(u).trim().toUpperCase()).filter(Boolean)));
    if (memberUids.length + 1 > maxTeamSize) {
      return errorRes('Team size limit', [`Teams can have at most ${maxTeamSize} members (including the lead)`], 400);
    }
    if (memberUids.length + 1 < minTeamSize) {
      return errorRes('Team size too small', [`Teams need at least ${minTeamSize} members (including the lead)`], 400);
    }

    const allUids = Array.from(new Set([leadRow.user.uid.toUpperCase(), ...memberUids]));
    const found = await prisma.user.findMany({
      where: { uid: { in: allUids }, role: 'STUDENT' },
      select: { id: true, uid: true, name: true, status: true, isVerified: true },
    });
    const byUid = new Map<string, { id: number; uid: string | null; name: string; status: string; isVerified: boolean }>();
    for (const m of found) if (m.uid && !byUid.has(m.uid)) byUid.set(m.uid, m);

    const missing: string[] = [];
    const unverified: string[] = [];
    const inactive: string[] = [];
    for (const uid of allUids) {
      const row = byUid.get(uid);
      if (!row) missing.push(uid);
      else if (row.status !== 'ACTIVE') inactive.push(`${row.name} (${uid})`);
      else if (!row.isVerified) unverified.push(`${row.name} (${uid})`);
    }
    if (missing.length > 0) {
      return errorRes('Invalid team members', [`These UIDs are not registered on the portal: ${missing.join(', ')}. Please ask these students to create an account first.`], 400);
    }
    if (unverified.length > 0) {
      return errorRes('Members not verified', [`These students haven't verified their email yet: ${unverified.join(', ')}. They can verify by logging in at tcetcercd.in with their email — the portal will ask them to enter the OTP sent to their inbox.`], 400);
    }
    if (inactive.length > 0) {
      return errorRes('Members account inactive', [`These students' accounts are inactive — contact the coordinator: ${inactive.join(', ')}`], 400);
    }

    const finalMemberIds = allUids.map((uid) => byUid.get(uid)!.id);

    // only NEW members are checked for other-team conflicts — existing members
    // (incl. the lead) already belong to this claim and may legitimately be on
    // other claims of the same event (dev/test data), which must not block edits.
    const existingMemberIds = claim.members.map((m) => m.userId);
    const newMemberIds = finalMemberIds.filter((id) => !existingMemberIds.includes(id));
    if (newMemberIds.length > 0) {
      const otherTeam = await prisma.claimMember.findFirst({
        where: {
          userId: { in: newMemberIds },
          claimId: { not: claim.id },
          claim: { problem: { eventId: event.id } },
        },
        select: { userId: true },
      });
      if (otherTeam) {
        return errorRes('Member already in another team', ['A selected member already belongs to an existing team for this hackathon event.'], 409);
      }
    }

    // apply: remove dropped members (never the lead), upsert new ones
    const keepIds = new Set(finalMemberIds);
    await prisma.claimMember.deleteMany({
      where: { claimId: claim.id, role: { not: 'LEAD' }, userId: { notIn: [...keepIds] } },
    });
    for (const id of finalMemberIds) {
      if (id === leadRow.userId) continue;
      await prisma.claimMember.upsert({
        where: { claimId_userId: { claimId: claim.id, userId: id } },
        update: {},
        create: { claimId: claim.id, userId: id, role: 'MEMBER' },
      });
    }

    // refresh the derivedInfo snapshot for the member set
    const finalMembers = await prisma.claimMember.findMany({
      where: { claimId: claim.id },
      include: { user: { select: { uid: true } } },
    });
    const oldDerived = (claim as { derivedInfo: unknown }).derivedInfo as { lead?: unknown } | null;
    await prisma.claim.update({
      where: { id: claim.id },
      data: {
        derivedInfo: {
          lead: oldDerived?.lead ?? deriveStudentInfo(leadRow.user.uid),
          members: Object.fromEntries(
            finalMembers.map((m) => [m.user.uid ?? `id:${m.userId}`, deriveStudentInfo(m.user.uid)])
          ),
        },
      },
    });

    return successRes(
      { members: finalMembers.map((m) => ({ userId: m.userId, role: m.role, uid: m.user.uid })) },
      'Team members updated'
    );
  } catch (err) {
    console.error('members edit error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
