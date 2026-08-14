import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationEventRegisterSchema } from '@/lib/validators';
import { parseStringList, sanitizeFilename, validateUploadFile } from '@/lib/innovation';
import { deleteFile, uploadFileWithObjectKey } from '@/lib/minio';
import { logActivity } from '@/lib/activity-log';
import { getSignedUrl } from '@/lib/minio';
import { EventDefaultConfig, getEventTypeDefaults } from '@/lib/platform-config';
import { deriveStudentInfo, DerivedStudentInfo } from '@/lib/student-info';

const normalizePhone = (raw: string): string | null => {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) return null;
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
};

type ClaimSummaryInput = {
  id: number;
  teamName: string | null;
  createdAt: Date;
  updatedAt: Date;
  submissionFileKey: string | null;
  problem: {
    id: number;
    title: string;
  };
  members: Array<{
    role: string;
    user: {
      id: number;
      name: string;
      email: string;
      uid: string | null;
    };
  }>;
};

const buildRegistrationSummary = async (claim: ClaimSummaryInput) => {
  const teamLeader = claim.members.find((member) => member.role === 'LEAD') || claim.members[0] || null;
  const submissionFileUrl = claim.submissionFileKey
    ? await getSignedUrl(claim.submissionFileKey).catch(() => null)
    : null;

  return {
    claimId: claim.id,
    teamName: claim.teamName || `Team-${claim.id}`,
    problem: {
      id: claim.problem.id,
      title: claim.problem.title,
    },
    teamLeader: teamLeader
      ? {
          id: teamLeader.user.id,
          name: teamLeader.user.name,
          email: teamLeader.user.email,
          uid: teamLeader.user.uid,
        }
      : null,
    members: claim.members.map((member) => ({
      role: member.role,
      user: {
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        uid: member.user.uid,
      },
    })),
    submissionFileUrl,
    submittedAt: claim.updatedAt.toISOString(),
    createdAt: claim.createdAt.toISOString(),
  };
};

// ── Event config resolution ──────────────────────────────────

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Deep-merge `override` over `base` (plain objects recurse, everything else replaces). */
const deepMerge = (base: Record<string, unknown>, override: unknown): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...base };
  if (!isPlainObject(override)) return result;
  for (const [key, value] of Object.entries(override)) {
    const baseValue = result[key];
    if (isPlainObject(value) && isPlainObject(baseValue)) {
      result[key] = deepMerge(baseValue, value);
    } else {
      result[key] = value;
    }
  }
  return result;
};

/**
 * Effective config for an event: the stored `config` (when present) deep-merged
 * over the event-type defaults. Returns null for legacy events created before
 * the config feature, in which case the route keeps the historical behavior.
 */
const resolveEffectiveConfig = (config: unknown, eventType: string): EventDefaultConfig | null =>
  config
    ? (deepMerge(
        getEventTypeDefaults(eventType || 'hackathon') as unknown as Record<string, unknown>,
        config,
      ) as unknown as EventDefaultConfig)
    : null;

// GET /api/innovation/events/[id]/register — registration meta for the form:
// student info derived from the session uid (never re-typed) + profile phone.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { uid: true, phone: true },
    });

    return successRes({
      uid: row?.uid ?? null,
      derived: deriveStudentInfo(row?.uid ?? null),
      phone: row?.phone ?? null,
    });
  } catch (err) {
    console.error('Registration meta GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// POST /api/innovation/events/[id]/register
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const { id } = await params;
    const eventId = Number(id);
    if (!Number.isInteger(eventId) || eventId <= 0) return errorRes('Invalid event id', [], 400);
    logActivity('INNOVATION_HACKATHON_REGISTER_ATTEMPT', {
      userId: user.id,
      eventId,
    });

    const formData = await req.formData();
    const teamName = ((formData.get('teamName') as string) || '').trim();
    const teamSize = Number(formData.get('teamSize'));
    const teamLeadUid = ((formData.get('teamLeadUid') as string) || '').trim().toUpperCase();
    const memberUids = parseStringList((formData.get('memberUids') as string) || '').map((uid) => uid.toUpperCase());
    const problemId = Number(formData.get('problemId'));
    const pptFile = formData.get('pptFile') as File | null;
    const mentor = ((formData.get('mentor') as string) || '').trim().toLowerCase().slice(0, 200);
    if (mentor && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mentor)) {
      return errorRes('Invalid mentor email', ['Enter a valid faculty email address'], 400);
    }
    const rawPhone = ((formData.get('phone') as string) || '').trim();
    const phone = normalizePhone(rawPhone);
    // Manual fallback for unparseable UIDs (shown only when derivation fails).
    const manualBranch = ((formData.get('manualBranch') as string) || '').trim().slice(0, 60);
    const manualYear = ((formData.get('manualYear') as string) || '').trim().slice(0, 10);
    const manualDivision = ((formData.get('manualDivision') as string) || '').trim().slice(0, 10);
    const manualRoll = ((formData.get('manualRoll') as string) || '').trim().slice(0, 10);

    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });

    const parsed = innovationEventRegisterSchema.safeParse({
      teamName,
      teamSize,
      teamLeadUid,
      memberUids,
      problemId,
    });

    let parsedData: z.infer<typeof innovationEventRegisterSchema> | null = null;
    const validationErrors = parsed.success ? null : parsed.error.issues.map((issue) => issue.message);

    if (parsed.success) {
      parsedData = parsed.data;
    } else {
      // problemId may be omitted for config-driven events where problem selection
      // is optional — retry without it when the only issues concern problemId.
      const onlyProblemIdIssues = parsed.error.issues.every((issue) => issue.path[0] === 'problemId');
      if (onlyProblemIdIssues) {
        const checkConfig = event ? resolveEffectiveConfig(event.config, event.eventType) : null;
        if (checkConfig && !checkConfig.registration.requiresProblemSelection) {
          const relaxed = innovationEventRegisterSchema
            .omit({ problemId: true })
            .safeParse({ teamName, teamSize, teamLeadUid, memberUids });
          if (relaxed.success) parsedData = { ...relaxed.data, problemId: 0 };
        }
      }
    }

    if (!parsedData) {
      return errorRes('Validation failed', validationErrors ?? [], 400);
    }

    const effectiveConfig = event ? resolveEffectiveConfig(event.config, event.eventType) : null;
    const regCfg = effectiveConfig?.registration ?? null;
    const requiresPpt = regCfg ? regCfg.requiresPpt : true;

    if (requiresPpt && !pptFile) {
      return errorRes('PPT file is required', ['Registration requires a pptFile upload'], 400);
    }

    const uploadError = validateUploadFile(pptFile, 'deck');
    if (uploadError) {
      return errorRes('Invalid upload', [uploadError], 400);
    }

    if (!event) return errorRes('Hackathon event not found', [], 404);

    const requiresProblemSelection = regCfg ? regCfg.requiresProblemSelection : true;

    const now = new Date();
    if (event.submissionLockAt && now > event.submissionLockAt) {
      return errorRes('Submission window closed', ['Submissions locked after the stated deadline — contact the coordinator if this is a mistake'], 400);
    }
    if (!event.registrationOpen || event.status === 'CLOSED' || now > event.endTime) {
      return errorRes('Event registration is closed', [], 400);
    }
    if (event.status !== 'UPCOMING' && event.status !== 'ACTIVE') {
      return errorRes('Event registration is closed', [`Registration is only open while the event is UPCOMING or ACTIVE (currently ${event.status})`], 400);
    }

    if (parsedData.teamSize !== parsedData.memberUids.length + 1) {
      return errorRes('Invalid team size', ['Team size must match team lead + member UID fields'], 400);
    }
    if (regCfg) {
      if (parsedData.teamSize < regCfg.minTeamSize || parsedData.teamSize > regCfg.maxTeamSize) {
        return errorRes(`Team size must be between ${regCfg.minTeamSize} and ${regCfg.maxTeamSize}`, [], 400);
      }
      if (!regCfg.allowSolo && parsedData.teamSize === 1) {
        return errorRes('Solo registration is not allowed for this event', [], 400);
      }
    }

    const hasDuplicateMemberUid = new Set(parsedData.memberUids.map((uid) => uid.toUpperCase())).size !== parsedData.memberUids.length;
    if (hasDuplicateMemberUid) {
      return errorRes('Duplicate member UIDs', ['Each member UID must be unique'], 400);
    }

    if (parsedData.memberUids.some((uid) => uid.toUpperCase() === parsedData.teamLeadUid.toUpperCase())) {
      return errorRes('Invalid team composition', ['Team lead UID cannot be repeated in member UIDs'], 400);
    }

    let problem: { id: number; title: string } | null;
    if (!requiresProblemSelection) {
      problem = await prisma.problem.findFirst({
        where: { eventId },
        select: { id: true, title: true },
      });
      if (!problem) return errorRes('This event has no problem statements to register against', [], 400);
    } else {
      problem = await prisma.problem.findFirst({
        where: { id: parsedData.problemId, eventId },
        select: { id: true, title: true },
      });
      if (!problem) return errorRes('Invalid problem selection', ['Selected problem is not part of this event'], 400);
    }

    const currentStudent = await prisma.user.findFirst({
      where: {
        id: user.id,
        role: 'STUDENT',
        status: 'ACTIVE',
        isVerified: true,
      },
      select: { id: true, uid: true },
    });

    if (!currentStudent || !currentStudent.uid) {
      return errorRes('UID required', ['Your student account must have a valid UID before event registration'], 400);
    }

    if (currentStudent.uid.toUpperCase() !== parsedData.teamLeadUid.toUpperCase()) {
      return errorRes('Invalid team lead', ['Team lead UID must be your own UID for this registration'], 400);
    }

    if (rawPhone && !phone) {
      return errorRes('Invalid phone number', ['Enter a valid 10-digit mobile number'], 400);
    }

    // Phone lives on the user profile (single source of truth) — save it there.
    if (phone) {
      await prisma.user
        .update({ where: { id: user.id }, data: { phone } })
        .catch(() => null);
    }

    let members: { id: number; uid: string | null }[];
    if (parsedData.teamSize === 1) {
      // Solo registration: no member UID lookups needed — the lead (logged-in
      // student) is the only member.
      members = [currentStudent];
    } else {
      const allMemberUids = Array.from(
        new Set([parsedData.teamLeadUid.toUpperCase(), ...parsedData.memberUids.map((uid) => uid.toUpperCase())])
      );
      const foundMembers = await prisma.user.findMany({
        where: { uid: { in: allMemberUids }, role: 'STUDENT', status: 'ACTIVE', isVerified: true },
        select: { id: true, uid: true },
      });

      // uid is NOT unique on User (legacy data) — dedupe by uid and compare
      // SETS, never lengths, or duplicate rows break the check.
      const membersByUid = new Map<string, { id: number; uid: string | null }>();
      for (const member of foundMembers) {
        if (member.uid && !membersByUid.has(member.uid)) membersByUid.set(member.uid, member);
      }
      const foundUids = new Set(membersByUid.keys());
      const missingUids = allMemberUids.filter((uid) => !foundUids.has(uid));
      if (missingUids.length > 0) {
        return errorRes('Invalid team members', [`These UIDs are not registered active students: ${missingUids.join(', ')}. Please register these users first.`], 400);
      }
      members = [...membersByUid.values()];
    }

    const memberIds = members.map((member) => member.id);

    // Snapshot of UID-derived info at registration time — branch/year/division/roll
    // are never re-typed by the student and never re-parsed later.
    const leadDerived = deriveStudentInfo(currentStudent.uid);
    const derivedInfo = {
      lead:
        leadDerived ??
        ({ manual: { branch: manualBranch, year: manualYear, division: manualDivision, rollNo: manualRoll } } as const),
      members: Object.fromEntries(
        members.map((member) => [member.uid ?? `id:${member.id}`, deriveStudentInfo(member.uid)]),
      ),
    };

    const existingInEvent = await prisma.claimMember.findFirst({
      where: {
        userId: { in: memberIds },
        claim: {
          problem: { eventId },
        },
      },
      include: {
        claim: {
          include: {
            problem: { select: { id: true, title: true } },
            members: {
              include: {
                user: { select: { id: true, name: true, email: true, uid: true } },
              },
            },
          },
        },
      },
    });

    if (existingInEvent) {
      const existingSummary = await buildRegistrationSummary({
        id: existingInEvent.claim.id,
        teamName: existingInEvent.claim.teamName,
        createdAt: existingInEvent.claim.createdAt,
        updatedAt: existingInEvent.claim.updatedAt,
        submissionFileKey: existingInEvent.claim.submissionFileKey,
        problem: {
          id: existingInEvent.claim.problem.id,
          title: existingInEvent.claim.problem.title,
        },
        members: existingInEvent.claim.members,
      });

      logActivity('INNOVATION_HACKATHON_REGISTER_REJECTED', {
        userId: user.id,
        eventId,
        problemId: problem.id,
        reason: 'DUPLICATE_MEMBER_IN_EVENT',
        conflictingClaimId: existingInEvent.claim.id,
      });

      return Response.json(
        {
          success: false,
          message: 'Already registered for this event. A selected member already belongs to an existing team.',
          data: existingSummary,
          errors: ['A selected member already belongs to an existing team for this hackathon event.'],
        },
        { status: 409 }
      );
    }

    // Upload FIRST: a failed upload now aborts before any claim exists, so it
    // can never leave an orphan claim (or block re-registration with a 409).
    let fileKey: string | null = null;
    if (pptFile) {
      const buffer = Buffer.from(await pptFile.arrayBuffer());
      const objectKey = `innovation/events/${eventId}/registration/${Date.now()}-${currentStudent.uid}-${sanitizeFilename(pptFile.name)}`;
      fileKey = await uploadFileWithObjectKey(objectKey, {
        buffer,
        mimetype: pptFile.type || 'application/octet-stream',
        size: buffer.length,
      });
    }

    // Authoritative duplicate check + create in one transaction. The involved
    // student rows are locked FOR UPDATE so concurrent registrations touching
    // the same member serialize: the second transaction blocks, then sees the
    // first one's claim after the lock releases.
    // ponytail: row-lock serialization; replace with a DB unique index on
    // (userId, eventId) if registration volume ever makes contention visible.
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id IN (${Prisma.join(memberIds)}) FOR UPDATE`;

      const existing = await tx.claimMember.findFirst({
        where: {
          userId: { in: memberIds },
          claim: {
            problem: { eventId },
          },
        },
        include: {
          claim: {
            include: {
              problem: { select: { id: true, title: true } },
              members: {
                include: {
                  user: { select: { id: true, name: true, email: true, uid: true } },
                },
              },
            },
          },
        },
      });

      if (existing) return { kind: 'existing', existing: existing.claim } as const;

      const claim = await tx.claim.create({
        data: {
          problemId: problem.id,
          teamName: parsedData.teamName,
          submissionFileKey: fileKey,
          mentor: mentor || null,
          derivedInfo,
          status: 'SUBMITTED',
          members: {
            create: memberIds.map((memberId) => ({
              userId: memberId,
              role: memberId === user.id ? 'LEAD' : 'MEMBER',
            })),
          },
        },
        include: {
          members: {
            include: {
              user: { select: { id: true, name: true, email: true, uid: true } },
            },
          },
          problem: { select: { id: true, title: true } },
        },
      });
      return { kind: 'created', claim } as const;
    });

    if (result.kind === 'existing') {
      // A duplicate slipped in between the fast-path check and the lock —
      // remove the just-uploaded file (best effort) and report the existing team.
      if (fileKey) await deleteFile(fileKey).catch(() => null);
      const existingSummary = await buildRegistrationSummary({
        id: result.existing.id,
        teamName: result.existing.teamName,
        createdAt: result.existing.createdAt,
        updatedAt: result.existing.updatedAt,
        submissionFileKey: result.existing.submissionFileKey,
        problem: result.existing.problem,
        members: result.existing.members,
      });

      logActivity('INNOVATION_HACKATHON_REGISTER_REJECTED', {
        userId: user.id,
        eventId,
        problemId: problem.id,
        reason: 'DUPLICATE_MEMBER_IN_EVENT',
        conflictingClaimId: result.existing.id,
      });

      return Response.json(
        {
          success: false,
          message: 'Already registered for this event. A selected member already belongs to an existing team.',
          data: existingSummary,
          errors: ['A selected member already belongs to an existing team for this hackathon event.'],
        },
        { status: 409 }
      );
    }

    const updated = result.claim;

    logActivity('INNOVATION_HACKATHON_REGISTER_SUBMITTED', {
      userId: user.id,
      eventId,
      claimId: updated.id,
      problemId: updated.problemId,
      teamSize: updated.members.length,
    });

    const registrationSummary = await buildRegistrationSummary({
      id: updated.id,
      teamName: updated.teamName,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      submissionFileKey: updated.submissionFileKey,
      problem: {
        id: updated.problem.id,
        title: updated.problem.title,
      },
      members: updated.members,
    });

    return successRes(
      {
        claimId: updated.id,
        registration: registrationSummary,
      },
      'Event registration successful.',
      201
    );
  } catch (err) {
    console.error('Innovation event register POST error:', err);
    logActivity('INNOVATION_HACKATHON_REGISTER_ERROR', {
      error: err instanceof Error ? err.message : 'UNKNOWN_ERROR',
    });
    return errorRes('Internal server error', [], 500);
  }
}
