import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationClaimSubmitSchema } from '@/lib/validators';
import { sanitizeFilename } from '@/lib/innovation';
import { uploadFileWithObjectKey } from '@/lib/minio';

// PATCH /api/innovation/claims/[id]/submit
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const { id } = await params;
    const claimId = Number(id);
    if (!Number.isInteger(claimId) || claimId <= 0) return errorRes('Invalid claim id', [], 400);

    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      include: { members: { select: { userId: true } } },
    });

    if (!claim) return errorRes('Claim not found', [], 404);
    const isOwner = claim.members.some((member) => member.userId === user.id);
    if (!isOwner) return errorRes('Forbidden', ['You can only submit your own claim'], 403);

    if (!['IN_PROGRESS', 'REVISION_REQUESTED'].includes(claim.status)) {
      return errorRes('Invalid claim state', ['Claim can only be submitted from IN_PROGRESS or REVISION_REQUESTED'], 400);
    }

    const formData = await req.formData();
    const submissionUrl = (formData.get('submissionUrl') as string | null) || '';
    const file = formData.get('file') as File | null;

    const parsed = innovationClaimSubmitSchema.safeParse({ submissionUrl });
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    if (!submissionUrl && !file) {
      return errorRes('Submission required', ['Provide submissionUrl and/or file'], 400);
    }

    let submissionFileKey: string | null = claim.submissionFileKey;

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const objectKey = `innovation/submissions/${claimId}/${Date.now()}-${sanitizeFilename(file.name)}`;
      submissionFileKey = await uploadFileWithObjectKey(objectKey, {
        buffer,
        mimetype: file.type || 'application/octet-stream',
        size: buffer.length,
      });
    }

    const updated = await prisma.claim.update({
      where: { id: claimId },
      data: {
        submissionUrl: submissionUrl || claim.submissionUrl || null,
        submissionFileKey,
        status: 'SUBMITTED',
      },
    });

    return successRes(updated, 'Claim submitted successfully.');
  } catch (err) {
    console.error('Innovation claim submit PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
