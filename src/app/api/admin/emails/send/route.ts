import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { dispatchEmail, sendEmail } from '@/lib/email-delivery';
import { buildAdminBroadcastEmailHtml } from '@/lib/email-templates';

type AudienceScope = 'CUSTOM' | 'STUDENTS' | 'FACULTY' | 'ALL_USERS';

type AdminEmailPayload = {
  scope: AudienceScope;
  emails?: string[] | string;
  subject: string;
  message: string;
  mode?: 'IMMEDIATE' | 'BULK';
};

export const runtime = 'nodejs';

const normalizeEmails = (emails: string[]) => {
  return Array.from(
    new Set(
      emails
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.length > 0),
    ),
  );
};

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const parseEmailList = (raw: string) =>
  normalizeEmails(
    raw
      .split(/[,;\n\s]+/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );

const resolveRecipients = async (scope: AudienceScope) => {
  const where: Record<string, unknown> = { status: 'ACTIVE' };
  if (scope === 'STUDENTS') {
    where.role = 'STUDENT';
  } else if (scope === 'FACULTY') {
    where.role = 'FACULTY';
  }

  const users = await prisma.user.findMany({
    where,
    select: { email: true },
  });

  return normalizeEmails(users.map((user) => user.email));
};

// POST /api/admin/emails/send
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const contentType = req.headers.get('content-type') || '';
    let payload: AdminEmailPayload | null = null;
    let attachments: File[] = [];

    if (contentType.includes('application/json')) {
      payload = (await req.json()) as AdminEmailPayload;
    } else {
      const formData = await req.formData();
      const formScope = formData.get('scope');
      const formMode = formData.get('mode');
      const formSubject = formData.get('subject');
      const formMessage = formData.get('message');
      const formEmails = formData.get('emails');

      payload = {
        scope: typeof formScope === 'string' ? (formScope as AudienceScope) : 'CUSTOM',
        subject: typeof formSubject === 'string' ? formSubject : '',
        message: typeof formMessage === 'string' ? formMessage : '',
        mode: typeof formMode === 'string' ? (formMode as 'IMMEDIATE' | 'BULK') : 'IMMEDIATE',
        emails: typeof formEmails === 'string' ? formEmails : undefined,
      };

      attachments = formData.getAll('attachments').filter((file) => file instanceof File) as File[];
    }

    const scope = payload?.scope;
    const subject = payload?.subject?.trim() || '';
    const message = payload?.message?.trim() || '';
    const mode = payload?.mode === 'BULK' ? 'bulk' : 'immediate';

    if (!scope || !['CUSTOM', 'STUDENTS', 'FACULTY', 'ALL_USERS'].includes(scope)) {
      return errorRes('Validation failed', ['A valid audience is required.'], 400);
    }

    if (subject.length < 3) {
      return errorRes('Validation failed', ['Subject must be at least 3 characters.'], 400);
    }

    if (message.length < 3) {
      return errorRes('Validation failed', ['Message must be at least 3 characters.'], 400);
    }

    let recipients: string[] = [];
    if (scope === 'CUSTOM') {
      const rawEmails = payload?.emails ?? [];
      const rawList = Array.isArray(rawEmails) ? normalizeEmails(rawEmails) : parseEmailList(String(rawEmails));
      recipients = normalizeEmails(rawList);
      const invalid = recipients.filter((email) => !isValidEmail(email));
      if (invalid.length > 0) {
        return errorRes('Validation failed', [`Invalid emails: ${invalid.slice(0, 5).join(', ')}`], 400);
      }
    } else {
      recipients = await resolveRecipients(scope);
    }

    if (recipients.length === 0) {
      return errorRes('Validation failed', ['No recipients found for the selected audience.'], 400);
    }

    if (attachments.length > 0 && mode === 'bulk') {
      return errorRes('Validation failed', ['Attachments are only supported with immediate delivery.'], 400);
    }

    if (attachments.length > 0 && scope !== 'CUSTOM') {
      return errorRes('Validation failed', ['Attachments are only supported for specific email recipients.'], 400);
    }

    const html = buildAdminBroadcastEmailHtml({
      subject,
      message,
    });

    if (attachments.length > 0) {
      const attachmentPayloads = await Promise.all(
        attachments.map(async (file) => ({
          filename: file.name || 'attachment',
          content: Buffer.from(await file.arrayBuffer()),
          contentType: file.type || undefined,
        })),
      );
      let sent = 0;
      for (const recipient of recipients) {
        await sendEmail({
          to: recipient,
          subject,
          html,
          attachments: attachmentPayloads,
        });
        sent += 1;
      }

      return successRes(
        {
          recipients: recipients.length,
          sent,
          queued: 0,
          duplicates: 0,
          failed: 0,
        },
        'Admin email sent successfully.',
      );
    }

    const result = await dispatchEmail({
      to: recipients,
      subject,
      html,
      category: 'ADMIN_CUSTOM_EMAIL',
      mode,
      metadata: {
        scope,
        requestedBy: user.email,
      },
    });

    return successRes(
      {
        recipients: recipients.length,
        ...result,
      },
      'Admin email queued successfully.',
    );
  } catch (err) {
    console.error('Admin custom email POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
