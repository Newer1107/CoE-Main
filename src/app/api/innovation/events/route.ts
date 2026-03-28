import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationEventCreateSchema } from '@/lib/validators';
import { getSignedUrl, uploadFileWithObjectKey } from '@/lib/minio';
import { sanitizeFilename } from '@/lib/innovation';

// GET /api/innovation/events
export async function GET() {
  try {
    const events = await prisma.hackathonEvent.findMany({
      include: {
        _count: { select: { problems: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ startTime: 'asc' }],
    });

    const payload = await Promise.all(
      events.map(async (event) => ({
        ...event,
        pptFileUrl: event.pptFileKey ? await getSignedUrl(event.pptFileKey).catch(() => null) : null,
      }))
    );

    return successRes(payload, 'Hackathon events retrieved.');
  } catch (err) {
    console.error('Innovation events GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// POST /api/innovation/events
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN', 'FACULTY')) return errorRes('Forbidden', ['Faculty or admin access required'], 403);

    const formData = await req.formData();
    const title = (formData.get('title') as string) || '';
    const description = ((formData.get('description') as string) || '').trim();
    const startTime = (formData.get('startTime') as string) || '';
    const endTime = (formData.get('endTime') as string) || '';
    const rawProblems = (formData.get('problems') as string) || '[]';
    const pptFile = formData.get('pptFile') as File | null;

    let problems: { title: string; description: string }[] = [];
    try {
      const parsedProblems = JSON.parse(rawProblems) as unknown;
      if (Array.isArray(parsedProblems)) {
        problems = parsedProblems
          .map((item) => {
            const row = item as { title?: unknown; description?: unknown };
            return {
              title: String(row.title || '').trim(),
              description: String(row.description || '').trim(),
            };
          })
          .filter((item) => item.title.length > 0 || item.description.length > 0);
      }
    } catch {
      problems = [];
    }

    const parsed = innovationEventCreateSchema.safeParse({
      title,
      description,
      startTime,
      endTime,
      problems,
    });
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const start = new Date(parsed.data.startTime);
    const end = new Date(parsed.data.endTime);
    if (end <= start) return errorRes('Invalid event timing', ['endTime must be after startTime'], 400);

    const event = await prisma.$transaction(async (tx) => {
      const createdEvent = await tx.hackathonEvent.create({
        data: {
          title: parsed.data.title,
          description: parsed.data.description || null,
          startTime: start,
          endTime: end,
          createdById: user.id,
        },
      });

      await tx.problem.createMany({
        data: parsed.data.problems.map((problem) => ({
          title: problem.title,
          description: problem.description,
          mode: 'CLOSED',
          createdById: user.id,
          eventId: createdEvent.id,
        })),
      });

      return createdEvent;
    });

    let pptFileKey: string | null = null;
    if (pptFile) {
      const allowed = [
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/pdf',
      ];
      if (!allowed.includes(pptFile.type)) {
        return errorRes('Invalid file type', ['Only PPT, PPTX, or PDF is allowed'], 400);
      }

      const buffer = Buffer.from(await pptFile.arrayBuffer());
      const objectKey = `innovation/events/${event.id}/${Date.now()}-${sanitizeFilename(pptFile.name)}`;
      pptFileKey = await uploadFileWithObjectKey(objectKey, {
        buffer,
        mimetype: pptFile.type,
        size: buffer.length,
      });

      await prisma.hackathonEvent.update({
        where: { id: event.id },
        data: { pptFileKey },
      });
    }

    const created = await prisma.hackathonEvent.findUnique({
      where: { id: event.id },
      include: {
        _count: { select: { problems: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return successRes(created, 'Hackathon event created successfully.', 201);
  } catch (err) {
    console.error('Innovation events POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
