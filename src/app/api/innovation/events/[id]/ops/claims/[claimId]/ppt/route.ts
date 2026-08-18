import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import { uploadFileWithObjectKey } from '@/lib/minio';
import { sanitizeFilename, validateUploadFile } from '@/lib/innovation';

// PUT /api/innovation/events/[id]/ops/claims/[claimId]/ppt — admin only, any phase.
// Replaces Claim.submissionFileKey for the team (PPT). Used from Coordinator Panel.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; claimId: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (user.role !== 'ADMIN') return errorRes('Admins only', [], 403);
    const { id, claimId } = await params;
    const eventId = Number(id);
    const cid = Number(claimId);
    if (!Number.isInteger(eventId) || !Number.isInteger(cid)) return errorRes('Invalid id', [], 400);
    const claim = await prisma.claim.findFirst({ where: { id: cid, problem: { eventId } }, select: { id: true, problemId: true } });
    if (!claim) return errorRes('Claim not found for this event', [], 404);

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File) || file.size <= 0) return errorRes('File is required', ['Pick a PPT/PDF file'], 400);
    const err = validateUploadFile(file as File, 'submission');
    if (err) return errorRes('Invalid upload', [err, `received: ${(file as File).type || 'unknown type'}, size: ${(file as File).size} bytes`], 400);

    const buffer = Buffer.from(await (file as File).arrayBuffer());
    const key = `innovation/submission/${cid}/${Date.now()}-${sanitizeFilename((file as File).name)}`;
    const fileKey = await uploadFileWithObjectKey(key, { buffer, mimetype: (file as File).type || 'application/octet-stream', size: buffer.length });
    await prisma.claim.update({ where: { id: cid }, data: { submissionFileKey: fileKey } });
    return successRes({ claimId: cid, submissionFileKey: fileKey }, 'PPT updated');
  } catch (e) {
    console.error('admin ppt PUT error:', e);
    return errorRes('Internal server error', [], 500);
  }
}
