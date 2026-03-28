import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationClaimCreateSchema } from '@/lib/validators';
import { ACTIVE_CLAIM_STATUSES } from '@/lib/innovation';
import { sendInnovationProblemClaimedEmail } from '@/lib/mailer';

// POST /api/innovation/claims
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const body = await req.json();
    const parsed = innovationClaimCreateSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const problem = await prisma.problem.findUnique({
      where: { id: parsed.data.problemId },
      include: { createdBy: { select: { id: true, email: true, name: true } }, event: true },
    });
    if (!problem) return errorRes('Problem not found', [], 404);
    if (problem.status === 'ARCHIVED') return errorRes('Problem is archived', [], 400);
    if (problem.eventId) return errorRes('Use event registration for hackathon problems', [], 400);

    const activeOpenClaimCount = await prisma.claimMember.count({
      where: {
        userId: user.id,
        claim: {
          status: { in: [...ACTIVE_CLAIM_STATUSES] },
          problem: {
            mode: 'OPEN',
            eventId: null,
          },
        },
      },
    });

    if (activeOpenClaimCount >= 3) {
      return errorRes('Open claim cap reached', ['A student can hold at most 3 active OPEN claims'], 400);
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
      return errorRes('UID required', ['Your student account must have a valid UID before claiming problems'], 400);
    }

    const memberUids = Array.from(new Set([currentStudent.uid, ...(parsed.data.memberUids || [])]));
    const members = await prisma.user.findMany({
      where: { uid: { in: memberUids }, role: 'STUDENT', status: 'ACTIVE', isVerified: true },
      select: { id: true, uid: true, email: true },
    });

    if (members.length !== memberUids.length) {
      const foundUids = new Set(members.map((member) => member.uid).filter(Boolean));
      const missingUids = memberUids.filter((uid) => !foundUids.has(uid));
      return errorRes('Invalid team members', [`These UIDs are not registered active students: ${missingUids.join(', ')}. Please register these users first.`], 400);
    }

    const memberIds = members.map((member) => member.id);

    const existingMembership = await prisma.claimMember.findFirst({
      where: {
        userId: { in: memberIds },
        claim: {
          problemId: problem.id,
          status: { in: [...ACTIVE_CLAIM_STATUSES] },
        },
      },
      select: { id: true },
    });
    if (existingMembership) return errorRes('Duplicate claim', ['A team member already has an active claim for this problem'], 400);

    const claim = await prisma.$transaction(async (tx) => {
      const latestProblem = await tx.problem.findUnique({ where: { id: problem.id } });
      if (!latestProblem) throw new Error('Problem not found during claim creation');

      if (latestProblem.mode === 'CLOSED') {
        if (latestProblem.status !== 'UNCLAIMED') {
          throw new Error('This CLOSED problem has already been claimed');
        }

        const existingClaim = await tx.claim.findFirst({
          where: {
            problemId: latestProblem.id,
            status: { in: ['IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED', 'SHORTLISTED', 'ACCEPTED'] },
          },
          select: { id: true },
        });
        if (existingClaim) throw new Error('This CLOSED problem has already been claimed');
      }

      const createdClaim = await tx.claim.create({
        data: {
          problemId: latestProblem.id,
          teamName: parsed.data.teamName || null,
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
          problem: true,
        },
      });

      if (latestProblem.mode === 'CLOSED') {
        await tx.problem.update({
          where: { id: latestProblem.id },
          data: { status: 'CLAIMED' },
        });
      }

      return createdClaim;
    });

    try {
      await sendInnovationProblemClaimedEmail(problem.createdBy.email, {
        problemTitle: problem.title,
        teamName: claim.teamName,
        claimedBy: user.name,
      });
    } catch (mailErr) {
      console.error('Problem claim email failed:', mailErr);
    }

    return successRes(claim, 'Problem claimed successfully.', 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    if (message.includes('already been claimed')) return errorRes(message, [], 400);
    console.error('Innovation claims POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
