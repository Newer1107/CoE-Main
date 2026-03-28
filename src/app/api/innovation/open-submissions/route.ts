import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationOpenSubmissionRegisterSchema } from '@/lib/validators';
import { parseStringList, sanitizeFilename } from '@/lib/innovation';
import { getSignedUrl, uploadFileWithObjectKey } from '@/lib/minio';

// POST /api/innovation/open-submissions
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const formData = await req.formData();
    const teamName = ((formData.get('teamName') as string) || '').trim();
    const teamSize = Number(formData.get('teamSize'));
    const teamLeadUid = ((formData.get('teamLeadUid') as string) || '').trim().toUpperCase();
    const memberUids = parseStringList((formData.get('memberUids') as string) || '').map((uid) => uid.toUpperCase());
    const problemId = Number(formData.get('problemId'));

    const technicalDocument = formData.get('technicalDocument') as File | null;
    const pptFile = formData.get('pptFile') as File | null;

    const parsed = innovationOpenSubmissionRegisterSchema.safeParse({
      problemId,
      teamName,
      teamSize,
      teamLeadUid,
      memberUids,
    });

    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    if (!technicalDocument || !pptFile) {
      return errorRes('Required files missing', ['Both technicalDocument and pptFile are mandatory for open statement registration'], 400);
    }

    if (parsed.data.teamSize !== parsed.data.memberUids.length + 1) {
      return errorRes('Invalid team size', ['Team size must match team lead + member UID fields'], 400);
    }

    const hasDuplicateMemberUid =
      new Set(parsed.data.memberUids.map((uid) => uid.toUpperCase())).size !== parsed.data.memberUids.length;
    if (hasDuplicateMemberUid) {
      return errorRes('Duplicate member UIDs', ['Each member UID must be unique'], 400);
    }

    if (parsed.data.memberUids.some((uid) => uid.toUpperCase() === parsed.data.teamLeadUid.toUpperCase())) {
      return errorRes('Invalid team composition', ['Team lead UID cannot be repeated in member UIDs'], 400);
    }

    const problem = await prisma.problem.findFirst({
      where: {
        id: parsed.data.problemId,
        mode: 'OPEN',
        eventId: null,
        status: 'OPENED',
      },
      select: {
        id: true,
        title: true,
      },
    });

    if (!problem) {
      return errorRes('Invalid problem selection', ['Selected open statement is closed for registrations or archived'], 400);
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
      return errorRes('UID required', ['Your student account must have a valid UID before open statement registration'], 400);
    }

    if (currentStudent.uid.toUpperCase() !== parsed.data.teamLeadUid.toUpperCase()) {
      return errorRes('Invalid team lead', ['Team lead UID must be your own UID for this registration'], 400);
    }

    const allMemberUids = Array.from(
      new Set([parsed.data.teamLeadUid.toUpperCase(), ...parsed.data.memberUids.map((uid) => uid.toUpperCase())])
    );

    const members = await prisma.user.findMany({
      where: {
        uid: { in: allMemberUids },
        role: 'STUDENT',
        status: 'ACTIVE',
        isVerified: true,
      },
      select: { id: true, uid: true, email: true, name: true },
    });

    if (members.length !== allMemberUids.length) {
      const foundUids = new Set(members.map((member) => member.uid).filter(Boolean));
      const missingUids = allMemberUids.filter((uid) => !foundUids.has(uid));
      return errorRes(
        'Invalid team members',
        [`These UIDs are not registered active students: ${missingUids.join(', ')}. Please register these users first.`],
        400
      );
    }

    const memberIds = members.map((member) => member.id);

    const existingParticipation = await prisma.openSubmissionMember.findFirst({
      where: {
        userId: { in: memberIds },
        openSubmission: {
          problemId: problem.id,
        },
      },
      select: { id: true },
    });

    if (existingParticipation) {
      return errorRes(
        'Registration conflict',
        ['A team member has already participated in this open problem statement'],
        400
      );
    }

    const allowedTechnicalMime = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedTechnicalMime.includes(technicalDocument.type)) {
      return errorRes(
        'Invalid technical document type',
        ['Technical document must be PDF, DOC, or DOCX'],
        400
      );
    }

    const allowedPptMime = [
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];

    if (!allowedPptMime.includes(pptFile.type)) {
      return errorRes('Invalid PPT file type', ['PPT file must be PPT or PPTX format'], 400);
    }

    const technicalBuffer = Buffer.from(await technicalDocument.arrayBuffer());
    const pptBuffer = Buffer.from(await pptFile.arrayBuffer());

    const submission = await prisma.openSubmission.create({
      data: {
        problemId: problem.id,
        teamName: parsed.data.teamName,
        teamSize: parsed.data.teamSize,
        teamLeadUid: parsed.data.teamLeadUid,
        technicalDocumentKey: `pending/${Date.now()}-${sanitizeFilename(technicalDocument.name)}`,
        pptFileKey: `pending/${Date.now()}-${sanitizeFilename(pptFile.name)}`,
        status: 'SUBMITTED',
        members: {
          create: memberIds.map((memberId) => ({
            userId: memberId,
            role: memberId === user.id ? 'LEAD' : 'MEMBER',
          })),
        },
      },
      include: {
        problem: {
          select: {
            id: true,
            title: true,
            mode: true,
            eventId: true,
          },
        },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, uid: true } },
          },
        },
      },
    });

    const technicalKey = `innovation/open-problems/${problem.id}/submissions/${submission.id}/technical-${Date.now()}-${sanitizeFilename(
      technicalDocument.name
    )}`;
    const pptKey = `innovation/open-problems/${problem.id}/submissions/${submission.id}/ppt-${Date.now()}-${sanitizeFilename(
      pptFile.name
    )}`;

    await uploadFileWithObjectKey(technicalKey, {
      buffer: technicalBuffer,
      mimetype: technicalDocument.type || 'application/octet-stream',
      size: technicalBuffer.length,
    });

    await uploadFileWithObjectKey(pptKey, {
      buffer: pptBuffer,
      mimetype: pptFile.type || 'application/octet-stream',
      size: pptBuffer.length,
    });

    const updated = await prisma.openSubmission.update({
      where: { id: submission.id },
      data: {
        technicalDocumentKey: technicalKey,
        pptFileKey: pptKey,
      },
      include: {
        problem: {
          select: {
            id: true,
            title: true,
            mode: true,
            eventId: true,
          },
        },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, uid: true } },
          },
        },
      },
    });

    const payload = {
      ...updated,
      technicalDocumentUrl: await getSignedUrl(updated.technicalDocumentKey).catch(() => null),
      pptFileUrl: await getSignedUrl(updated.pptFileKey).catch(() => null),
      submissionType: 'OPEN' as const,
    };

    return successRes(payload, 'Open statement registration submitted successfully.', 201);
  } catch (err) {
    console.error('Open submissions POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
