import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { innovationProgramCreateSchema } from '@/lib/validators';
import { getSignedUrl, uploadFileWithObjectKey } from '@/lib/minio';
import { sanitizeFilename } from '@/lib/innovation';

const getStartOfToday = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
};

// GET /api/innovation/programs
export async function GET() {
  try {
    const programs = await prisma.innovationProgram.findMany({
      where: {
        eventDate: {
          gte: getStartOfToday(),
        },
      },
      include: {
        _count: { select: { interests: true } },
      },
      orderBy: [{ eventDate: 'asc' }, { startTime: 'asc' }],
    });

    const payload = await Promise.all(
      programs.map(async (program) => ({
        ...program,
        interestCount: program._count.interests,
        noticeFileUrl: program.noticeFileKey ? await getSignedUrl(program.noticeFileKey).catch(() => null) : null,
      }))
    );

    return successRes(payload, 'Innovation programs retrieved successfully.');
  } catch (err) {
    console.error('Innovation programs GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// POST /api/innovation/programs
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const formData = await req.formData();
    const title = String(formData.get('title') || '');
    const description = String(formData.get('description') || '');
    const programType = String(formData.get('programType') || '');
    const venue = String(formData.get('venue') || '');
    const eventDate = String(formData.get('eventDate') || '');
    const startTime = String(formData.get('startTime') || '');
    const endTime = String(formData.get('endTime') || '');
    const noticeFile = (formData.get('noticeFile') as File | null) || null;

    const parsed = innovationProgramCreateSchema.safeParse({
      title,
      description,
      programType,
      venue,
      eventDate,
      startTime,
      endTime,
    });
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const eventDateValue = new Date(parsed.data.eventDate);
    const startTimeValue = new Date(parsed.data.startTime);
    const endTimeValue = new Date(parsed.data.endTime);
    if (eventDateValue < getStartOfToday()) {
      return errorRes('Validation failed', ['Date must not be in the past'], 400);
    }
    if (endTimeValue <= startTimeValue) {
      return errorRes('Validation failed', ['End time must be after start time'], 400);
    }

    let noticeFileKey: string | null = null;
    if (noticeFile) {
      if (noticeFile.type !== 'application/pdf') {
        return errorRes('Invalid file type', ['Only PDF notice files are allowed'], 400);
      }

      const buffer = Buffer.from(await noticeFile.arrayBuffer());
      const objectKey = `innovation/programs/notice/${Date.now()}-${sanitizeFilename(noticeFile.name)}`;
      noticeFileKey = await uploadFileWithObjectKey(objectKey, {
        buffer,
        mimetype: noticeFile.type,
        size: buffer.length,
      });
    }

    const created = await prisma.innovationProgram.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        programType: parsed.data.programType,
        venue: parsed.data.venue,
        eventDate: eventDateValue,
        startTime: startTimeValue,
        endTime: endTimeValue,
        noticeFileKey,
        createdById: user.id,
      },
      include: {
        _count: { select: { interests: true } },
      },
    });

    return successRes(
      {
        ...created,
        interestCount: created._count.interests,
        noticeFileUrl: created.noticeFileKey ? await getSignedUrl(created.noticeFileKey).catch(() => null) : null,
      },
      'Innovation program created successfully.',
      201,
    );
  } catch (err) {
    console.error('Innovation programs POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
