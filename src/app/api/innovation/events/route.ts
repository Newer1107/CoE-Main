import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationEventCreateSchema } from '@/lib/validators';
import { getSignedUrl, uploadFileWithObjectKey } from '@/lib/minio';
import { sanitizeFilename } from '@/lib/innovation';
import { getEventTypeDefaults, getRubricTemplate } from '@/lib/platform-config';
import { Prisma } from '@prisma/client';

const parseBooleanLike = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'on'].includes(normalized);
  }
  return false;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Deep-merge `override` over `base` (plain objects recurse, everything else replaces). */
const deepMerge = (base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
};

// GET /api/innovation/events
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventTypeParam = searchParams.get('eventType')?.trim() || undefined;
    const statusParam = searchParams.get('status')?.trim().toUpperCase() || undefined;
    const featuredParam = searchParams.get('featured');
    const searchParam = searchParams.get('search')?.trim() || undefined;
    const sortParam = searchParams.get('sort')?.trim().toLowerCase() || undefined;

    // Only apply the status filter when the value is a real EventStatus.
    const EVENT_STATUSES = ['UPCOMING', 'ACTIVE', 'JUDGING', 'CLOSED'] as const;
    type EventStatusValue = (typeof EVENT_STATUSES)[number];
    const statusFilter: EventStatusValue | undefined =
      statusParam && (EVENT_STATUSES as readonly string[]).includes(statusParam)
        ? (statusParam as EventStatusValue)
        : undefined;

    let featuredFilter: boolean | undefined;
    if (featuredParam === 'true') featuredFilter = true;
    else if (featuredParam === 'false') featuredFilter = false;

    const where: Prisma.HackathonEventWhereInput = {
      ...(eventTypeParam ? { eventType: eventTypeParam } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(featuredFilter !== undefined ? { featured: featuredFilter } : {}),
      // MySQL's default collation makes `contains` case-insensitive.
      ...(searchParam
        ? {
            OR: [
              { title: { contains: searchParam } },
              { problems: { some: { title: { contains: searchParam } } } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.HackathonEventOrderByWithRelationInput[] =
      sortParam === 'newest' ? [{ createdAt: 'desc' }] : [{ startTime: 'asc' }];

    const events = await prisma.hackathonEvent.findMany({
      where,
      include: {
        _count: { select: { problems: true, interests: true } },
        createdBy: { select: { id: true, name: true } },
        interests: { select: { hasDetails: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy,
    });

    const payload = await Promise.all(
      events.map(async (event) => {
        const { interests, config, pptFileKey, createdById, ...eventData } = event;
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
    const submissionLockAtRaw = formData.get('submissionLockAt') as string | null;
    const submissionLockAt = submissionLockAtRaw && submissionLockAtRaw.trim().length > 0 ? submissionLockAtRaw : undefined;
    const totalSessionsRaw = (formData.get('totalSessions') as string) || '1';
    const rawProblems = (formData.get('problems') as string) || '[]';
    const pptFile = formData.get('pptFile') as File | null;

    // Per-event type + config (new-style). Legacy requests omit both fields and
    // keep the pre-existing behavior: eventType defaults to 'hackathon' on the
    // row, config is stored as null, and no RubricCategory rows are created.
    const eventTypeField = formData.get('eventType');
    const configField = formData.get('config');
    const hasEventType = typeof eventTypeField === 'string' && eventTypeField.trim().length > 0;
    const hasConfig = typeof configField === 'string' && configField.trim().length > 0;
    const isNewStyle = hasEventType || hasConfig;
    const eventType = hasEventType ? (eventTypeField as string).trim() : undefined;

    let explicitConfig: Record<string, unknown> | undefined;
    if (hasConfig) {
      try {
        const parsedConfig = JSON.parse(configField as string) as unknown;
        if (!isPlainObject(parsedConfig)) {
          return errorRes('Validation failed', ['config must be a JSON object'], 400);
        }
        explicitConfig = parsedConfig;
      } catch {
        return errorRes('Validation failed', ['config must be a valid JSON object string'], 400);
      }
    }

    const effectiveConfig = isNewStyle
      ? deepMerge(
          getEventTypeDefaults(eventType ?? 'hackathon') as unknown as Record<string, unknown>,
          explicitConfig ?? {},
        )
      : null;

    const rubricTemplateKey = effectiveConfig
      ? (effectiveConfig.rubrics as { template?: unknown } | undefined)?.template
      : undefined;
    const rubricTemplate =
      effectiveConfig && typeof rubricTemplateKey === 'string' && rubricTemplateKey !== 'none'
        ? getRubricTemplate(rubricTemplateKey)
        : null;

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
      eventType,
      config: explicitConfig,
    });
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const start = new Date(parsed.data.startTime);
    const end = new Date(parsed.data.endTime);
    const submissionLockDate = parsed.data.submissionLockAt ? new Date(parsed.data.submissionLockAt) : null;
    if (end <= start) return errorRes('Invalid event timing', ['endTime must be after startTime'], 400);
    if (submissionLockDate && submissionLockDate > end) {
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
          ...(effectiveConfig
            ? {
                eventType: eventType ?? 'hackathon',
                config: effectiveConfig as Prisma.InputJsonValue,
              }
            : {}),
        },
      });

      await tx.hackathonSessionUploadLock.createMany({
        data: Array.from({ length: parsed.data.totalSessions }, (_, index) => ({
          eventId: createdEvent.id,
          session: index + 1,
          isOpen: index === 0,
          updatedByUserId: user.id,
        })),
      });

      if (rubricTemplate) {
        await tx.rubricCategory.createMany({
          data: rubricTemplate.categories.map((category, index) => ({
            eventId: createdEvent.id,
            key: category.key,
            label: category.label,
            weight: category.weight,
            order: index,
          })),
        });
      }

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
