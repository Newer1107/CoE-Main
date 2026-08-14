import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { uploadFile } from '@/lib/minio';

const MAX_PPT_MB = 10;

// PUT /api/innovation/claims/[id]/submission — team lead re-uploads the presentation
// (only before the submission lock; members get 403).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    const claimId = Number((await params).id);
    if (!Number.isInteger(claimId)) return errorRes('Invalid claim', [], 400);

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return errorRes('Presentation file is required', [], 400);
    }
    const file = formData.get('pptFile');
    if (!file || typeof (file as File).arrayBuffer !== 'function') {
      return errorRes('Presentation file is required', [], 400);
    }
    const pptFile = file as File;
    if (pptFile.size > MAX_PPT_MB * 1024 * 1024) {
      return errorRes('File too large', [`Presentation must be under ${MAX_PPT_MB} MB`], 400);
    }
    if (!/\.(ppt|pptx|pdf)$/i.test(pptFile.name)) {
      return errorRes('Invalid file type', ['Only .ppt, .pptx or .pdf files are allowed'], 400);
    }

    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      include: {
        problem: { select: { eventId: true } },
        members: { select: { userId: true, role: true } },
      },
    });
    if (!claim || !claim.problem.eventId) return errorRes('Claim not found', [], 404);

    const isLeader = claim.members.some((m) => m.role === 'LEAD' && m.userId === user.id);
    if (!isLeader) {
      return errorRes('Only the team lead can re-upload', ['Ask your team lead to update the presentation'], 403);
    }

    const event = await prisma.hackathonEvent.findUnique({ where: { id: claim.problem.eventId } });
    if (!event) return errorRes('Event not found', [], 404);
    const now = new Date();
    if (event.submissionLockAt && now > event.submissionLockAt) {
      return errorRes('Submission window closed', ['Presentations are locked after the stated deadline'], 400);
    }
    if (event.status !== 'UPCOMING' && event.status !== 'ACTIVE') {
      return errorRes('Event registration is closed', [`Submissions are only open while the event is UPCOMING or ACTIVE (currently ${event.status})`], 400);
    }

    const buffer = Buffer.from(await pptFile.arrayBuffer());
    const fileKey = await uploadFile(`events/${event.id}/claims/${claimId}`, {
      buffer,
      originalname: pptFile.name,
      mimetype: pptFile.type,
      size: pptFile.size,
    });

    const updated = await prisma.claim.update({
      where: { id: claimId },
      data: { submissionFileKey: fileKey },
      select: { id: true, submissionFileKey: true, updatedAt: true },
    });

    return successRes(
      { claimId: updated.id, pptUploaded: !!updated.submissionFileKey, updatedAt: updated.updatedAt.toISOString() },
      'Presentation updated'
    );
  } catch (err) {
    console.error('submission re-upload error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
