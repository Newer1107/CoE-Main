import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationEventRegisterSchema } from '@/lib/validators';
import { parseStringList, sanitizeFilename } from '@/lib/innovation';
import { uploadFileWithObjectKey } from '@/lib/minio';

// POST /api/innovation/events/[id]/register
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const { id } = await params;
    const eventId = Number(id);
    if (!Number.isInteger(eventId) || eventId <= 0) return errorRes('Invalid event id', [], 400);

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
          problemId: problem.id,
        },
      },
      select: { id: true },
    });

    if (existingInEvent) {
      return errorRes('Registration conflict', ['A team member is already registered for this problem statement in this hackathon'], 400);
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
            user: { select: { id: true, name: true, email: true } },
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
            user: { select: { id: true, name: true, email: true } },
          },
        },
        problem: {
          include: {
            event: { select: { id: true, title: true, status: true } },
          },
        },
      },
    });

    return successRes(updated, 'Event registration successful.', 201);
  } catch (err) {
    console.error('Innovation event register POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
