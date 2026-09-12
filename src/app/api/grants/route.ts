import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { successRes, errorRes, authenticate, authorize } from '@/lib/api-helpers';
import { grantCreateSchema } from '@/lib/validators';
import { uploadFile, getSignedUrl } from '@/lib/minio';

// POST /api/grants
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN', 'FACULTY')) return errorRes('Forbidden', [], 403);

    const formData = await req.formData();
    const title = formData.get('title') as string;
    const issuingBody = formData.get('issuingBody') as string;
    const category = formData.get('category') as string;
    const description = formData.get('description') as string;
    const deadline = formData.get('deadline') as string;
    const referenceLink = (formData.get('referenceLink') as string) || '';
    const attachment = formData.get('attachment') as File | null;
    const source = (formData.get('source') as string) || 'MANUAL';
    const month = (formData.get('month') as string) || null;
    const isTentativeRaw = formData.get('isTentative') as string | null;
    const isTentative = isTentativeRaw === null || isTentativeRaw === '' ? undefined : isTentativeRaw === 'true';

    const parsed = grantCreateSchema.safeParse({ title, issuingBody, category, description, deadline, referenceLink, source, month, isTentative });
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((e: any) => e.message), 400);

    let attachmentKey: string | null = null;
    if (attachment) {
      if (attachment.type !== 'application/pdf') {
        return errorRes('Only PDF attachments are allowed.', [], 400);
      }
      const buffer = Buffer.from(await attachment.arrayBuffer());
      attachmentKey = await uploadFile('grants', {
        buffer, originalname: attachment.name, mimetype: attachment.type, size: buffer.length,
      });
    }

    const grant = await prisma.grant.create({
      data: {
        title, issuingBody,
        category: parsed.data.category as 'GOVT_GRANT' | 'SCHOLARSHIP' | 'RESEARCH_FUND' | 'INDUSTRY_GRANT',
        description, deadline: new Date(deadline),
        referenceLink: referenceLink || null,
        attachmentKey, postedById: user.id,
        source: parsed.data.source || 'MANUAL',
        month: parsed.data.month || null,
        isTentative: parsed.data.isTentative ?? false,
      },
    });

    return successRes(grant, 'Grant created.', 201);
  } catch (err) {
    console.error('Grant create error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// GET /api/grants — public
export async function GET() {
  try {
    const grants = await prisma.grant.findMany({
      where: { isActive: true },
      orderBy: { deadline: 'asc' },
      include: { postedBy: { select: { id: true, name: true } } },
    });

    const withUrls = await Promise.all(
      grants.map(async (g) => ({
        ...g,
        attachmentUrl: g.attachmentKey ? await getSignedUrl(g.attachmentKey).catch(() => null) : null,
      }))
    );

    return successRes(withUrls, 'Grants retrieved.');
  } catch (err) {
    console.error('Grants list error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
