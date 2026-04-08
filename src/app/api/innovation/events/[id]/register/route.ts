import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationEventRegisterSchema } from '@/lib/validators';
import { parseStringList, sanitizeFilename } from '@/lib/innovation';
import { uploadFileWithObjectKey } from '@/lib/minio';
import { logActivity } from '@/lib/activity-log';
import { getSignedUrl } from '@/lib/minio';

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

    const parsed = innovationEventRegisterSchema.safeParse({
      teamName,
      teamSize,
      teamLeadUid,
      memberUids,
      problemId,
    });
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    if (!pptFile) return errorRes('PPT file is required', ['Registration requires a pptFile upload'], 400);

    const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId } });
    if (!event) return errorRes('Hackathon event not found', [], 404);

    const now = new Date();
    if (!event.registrationOpen || event.status === 'CLOSED' || now > event.endTime) {
      return errorRes('Registration closed', ['Registration is closed after the event registration closing date'], 400);
    }

    if (parsed.data.teamSize !== parsed.data.memberUids.length + 1) {
      return errorRes('Invalid team size', ['Team size must match team lead + member UID fields'], 400);
    }

    const hasDuplicateMemberUid = new Set(parsed.data.memberUids.map((uid) => uid.toUpperCase())).size !== parsed.data.memberUids.length;
    if (hasDuplicateMemberUid) {
      return errorRes('Duplicate member UIDs', ['Each member UID must be unique'], 400);
    }

    if (parsed.data.memberUids.some((uid) => uid.toUpperCase() === parsed.data.teamLeadUid.toUpperCase())) {
      return errorRes('Invalid team composition', ['Team lead UID cannot be repeated in member UIDs'], 400);
    }

    const problem = await prisma.problem.findFirst({
      where: { id: parsed.data.problemId, eventId },
      select: { id: true, title: true },
    });
    if (!problem) return errorRes('Invalid problem selection', ['Selected problem is not part of this event'], 400);

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

    if (currentStudent.uid.toUpperCase() !== parsed.data.teamLeadUid.toUpperCase()) {
      return errorRes('Invalid team lead', ['Team lead UID must be your own UID for this registration'], 400);
    }

    const allMemberUids = Array.from(
      new Set([parsed.data.teamLeadUid.toUpperCase(), ...parsed.data.memberUids.map((uid) => uid.toUpperCase())])
    );
    const members = await prisma.user.findMany({
      where: { uid: { in: allMemberUids }, role: 'STUDENT', status: 'ACTIVE', isVerified: true },
      select: { id: true, uid: true, email: true },
    });

    if (members.length !== allMemberUids.length) {
      const foundUids = new Set(members.map((member) => member.uid).filter(Boolean));
      const missingUids = allMemberUids.filter((uid) => !foundUids.has(uid));
      return errorRes('Invalid team members', [`These UIDs are not registered active students: ${missingUids.join(', ')}. Please register these users first.`], 400);
    }

    const memberIds = members.map((member) => member.id);

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

    const claim = await prisma.claim.create({
      data: {
        problemId: problem.id,
        teamName: parsed.data.teamName,
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

    const buffer = Buffer.from(await pptFile.arrayBuffer());
    const objectKey = `innovation/events/${eventId}/registration/${claim.id}-${sanitizeFilename(pptFile.name)}`;
    const fileKey = await uploadFileWithObjectKey(objectKey, {
      buffer,
      mimetype: pptFile.type || 'application/octet-stream',
      size: buffer.length,
    });

    const updated = await prisma.claim.update({
      where: { id: claim.id },
      data: {
        submissionFileKey: fileKey,
        status: 'SUBMITTED',
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, uid: true } },
          },
        },
        problem: {
          include: {
            event: { select: { id: true, title: true, status: true } },
          },
        },
      },
    });

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
