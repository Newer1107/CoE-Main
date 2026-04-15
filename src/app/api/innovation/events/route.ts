import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationEventCreateSchema } from '@/lib/validators';
import { getSignedUrl, uploadFileWithObjectKey } from '@/lib/minio';
import { sanitizeFilename } from '@/lib/innovation';

const parseBooleanLike = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'on'].includes(normalized);
  }
  return false;
};

// GET /api/innovation/events
export async function GET() {
  try {
    const events = await prisma.hackathonEvent.findMany({
      include: {
        _count: { select: { problems: true, interests: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        interests: { select: { hasDetails: true } },
      },
      orderBy: [{ startTime: 'asc' }],
    });

    const payload = await Promise.all(
      events.map(async (event) => {
        const { interests, ...eventData } = event;
        const totalWithDetails = interests.reduce(
          (count, interest) => count + (interest.hasDetails ? 1 : 0),
          0,
        );

        return {
          ...eventData,
          totalInterested: event._count.interests,
          totalInterestedWithDetails: totalWithDetails,
          pptFileUrl: event.pptFileKey ? await getSignedUrl(event.pptFileKey).catch(() => null) : null,
        };
      })
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
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const formData = await req.formData();
    const title = (formData.get('title') as string) || '';
    const description = ((formData.get('description') as string) || '').trim();
    const startTime = (formData.get('startTime') as string) || '';
    const endTime = (formData.get('endTime') as string) || '';
    const submissionLockAt = (formData.get('submissionLockAt') as string) || '';
    const totalSessionsRaw = (formData.get('totalSessions') as string) || '1';
    const rawProblems = (formData.get('problems') as string) || '[]';
    const pptFile = formData.get('pptFile') as File | null;

    let problems: { title: string; description: string; isIndustryProblem: boolean; industryName: string }[] = [];
    try {
      const parsedProblems = JSON.parse(rawProblems) as unknown;
      if (Array.isArray(parsedProblems)) {
        problems = parsedProblems
          .map((item) => {
            const row = item as { title?: unknown; description?: unknown; isIndustryProblem?: unknown; industryName?: unknown };
            return {
              title: String(row.title || '').trim(),
              description: String(row.description || '').trim(),
              isIndustryProblem: parseBooleanLike(row.isIndustryProblem),
              industryName: String(row.industryName || '').trim(),
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
      submissionLockAt,
      totalSessions: totalSessionsRaw,
      problems,
    });
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const start = new Date(parsed.data.startTime);
    const end = new Date(parsed.data.endTime);
    const submissionLockDate = new Date(parsed.data.submissionLockAt);
    if (end <= start) return errorRes('Invalid event timing', ['endTime must be after startTime'], 400);
    if (submissionLockDate > end) {
      return errorRes('Invalid submission lock time', ['submissionLockAt must be on or before endTime'], 400);
    }

    const { event, createdProblems } = await prisma.$transaction(async (tx) => {
      const createdEvent = await tx.hackathonEvent.create({
        data: {
          title: parsed.data.title,
          description: parsed.data.description || null,
          startTime: start,
          endTime: end,
          submissionLockAt: submissionLockDate,
          totalSessions: parsed.data.totalSessions,
          createdById: user.id,
        },
      });

      const created = [] as Array<{ id: number }>;
      for (const problem of parsed.data.problems) {
        const createdProblem = await tx.problem.create({
          data: {
            title: problem.title,
            description: problem.description,
            isIndustryProblem: problem.isIndustryProblem,
            industryName: problem.isIndustryProblem ? problem.industryName : null,
            mode: 'CLOSED',
            createdById: user.id,
            eventId: createdEvent.id,
          },
          select: { id: true },
        });
        created.push(createdProblem);
      }

      return {
        event: createdEvent,
        createdProblems: created,
      };
    });

    const problemFiles = parsed.data.problems.map((_, index) => formData.get(`problemSupportDocument_${index}`) as File | null);

    for (let index = 0; index < createdProblems.length; index += 1) {
      const file = problemFiles[index];
      if (!file) continue;

      if (file.type !== 'application/pdf') {
        return errorRes('Invalid file type', [`Problem #${index + 1} support document must be a PDF file`], 400);
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const objectKey = `innovation/events/${event.id}/problems/${createdProblems[index].id}/support/${Date.now()}-${sanitizeFilename(file.name)}`;
      const supportDocumentKey = await uploadFileWithObjectKey(objectKey, {
        buffer,
        mimetype: file.type,
        size: buffer.length,
      });

      await prisma.problem.update({
        where: { id: createdProblems[index].id },
        data: { supportDocumentKey },
      });
    }

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
