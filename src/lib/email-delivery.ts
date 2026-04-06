import crypto from 'crypto';
import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';
import prisma from '@/lib/prisma';

export type EmailDeliveryMode = 'immediate' | 'bulk';

export type DispatchEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  category: string;
  mode?: EmailDeliveryMode;
  dedupeKey?: string;
  metadata?: Record<string, unknown>;
};

type EmailJobStatus = 'PENDING' | 'PROCESSING' | 'RETRY' | 'SENT' | 'FAILED';

const EMAIL_JOB_STATUSES: EmailJobStatus[] = ['PENDING', 'PROCESSING', 'RETRY', 'SENT', 'FAILED'];

const OAUTH_ENV_KEYS = ['SMTP_USER', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'] as const;

type MailTransporter = ReturnType<typeof nodemailer.createTransport>;

const globalForMail = globalThis as typeof globalThis & {
  __coeOAuth2Transporter?: MailTransporter;
};

const getMissingOAuthEnvVars = () => {
  return OAUTH_ENV_KEYS.filter((key) => {
    const value = process.env[key];
    return !value || value.trim().length === 0;
  });
};

const getTransporter = () => {
  if (globalForMail.__coeOAuth2Transporter) {
    return globalForMail.__coeOAuth2Transporter;
  }

  const missing = getMissingOAuthEnvVars();
  if (missing.length > 0) {
    throw new Error(`Missing SMTP OAuth2 environment variables: ${missing.join(', ')}`);
  }

  globalForMail.__coeOAuth2Transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: process.env.SMTP_USER,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
    },
  });

  return globalForMail.__coeOAuth2Transporter;
};

const isAuthOrTokenError = (err: unknown) => {
  if (!(err instanceof Error)) return false;

  const text = `${err.message}`.toLowerCase();
  const errorCode = (err as any)?.code;
  const responseCode = (err as any)?.responseCode;
  const command = `${(err as any)?.command || ''}`.toLowerCase();

  if (errorCode === 'EAUTH' || responseCode === 534 || responseCode === 535) {
    return true;
  }

  if (command.includes('xoauth2') || command.includes('auth')) {
    return true;
  }

  return (
    text.includes('oauth') ||
    text.includes('token') ||
    text.includes('invalid_grant') ||
    text.includes('auth') ||
    text.includes('login') ||
    text.includes('smtp oauth2')
  );
};

const logAuthOrTokenError = (err: unknown, context: { to: string | string[]; subject: string }) => {
  console.error('[EMAIL_AUTH_ERROR] OAuth2 token/auth failure while sending email', {
    to: context.to,
    subject: context.subject,
    message: err instanceof Error ? err.message : String(err),
    code: (err as any)?.code ?? null,
    responseCode: (err as any)?.responseCode ?? null,
    command: (err as any)?.command ?? null,
  });
};

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Mail.Attachment[];
};

export const sendEmail = async ({ to, subject, html, attachments }: SendEmailInput) => {
  try {
    const transporter = getTransporter();
    return await transporter.sendMail({
      from: process.env.SMTP_FROM || '"TCET CoE" <noreply@tcetmumbai.in>',
      to,
      subject,
      html,
      attachments,
    });
  } catch (err) {
    if (isAuthOrTokenError(err)) {
      logAuthOrTokenError(err, { to, subject });
    } else {
      console.error('[EMAIL_SEND_ERROR] SMTP send failed', {
        to,
        subject,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    throw err;
  }
};

const now = () => new Date();

const asRecipients = (to: string | string[]) => {
  const raw = Array.isArray(to) ? to : [to];
  return Array.from(new Set(raw.map((email) => email.trim().toLowerCase()).filter((email) => email.length > 0)));
};

const maxAttempts = Number.parseInt(process.env.EMAIL_MAX_ATTEMPTS || '5', 10);
const immediatePriority = Number.parseInt(process.env.EMAIL_PRIORITY_IMMEDIATE || '100', 10);
const bulkPriority = Number.parseInt(process.env.EMAIL_PRIORITY_BULK || '20', 10);

const buildBulkDedupeKey = (category: string, to: string, subject: string, html: string, dedupeKey?: string) => {
  if (dedupeKey) return dedupeKey;

  const dayBucket = new Date().toISOString().slice(0, 10);
  const signature = crypto
    .createHash('sha256')
    .update(`${category}|${to}|${subject}|${html}`)
    .digest('hex')
    .slice(0, 24);

  return `bulk:${category}:${to}:${dayBucket}:${signature}`;
};

const computeRetryAt = (attempts: number) => {
  const minutes = Math.min(60, Math.max(1, 2 ** Math.max(0, attempts - 1)));
  return new Date(Date.now() + minutes * 60 * 1000);
};

const createEmailJob = async (input: {
  toEmail: string;
  subject: string;
  htmlBody: string;
  category: string;
  mode: 'IMMEDIATE' | 'BULK';
  priority: number;
  dedupeKey?: string;
  metadata?: Record<string, unknown>;
}) => {
  try {
    const job = await (prisma as any).emailJob.create({
      data: {
        toEmail: input.toEmail,
        subject: input.subject,
        htmlBody: input.htmlBody,
        category: input.category,
        mode: input.mode,
        status: 'PENDING',
        priority: input.priority,
        maxAttempts,
        nextAttemptAt: now(),
        dedupeKey: input.dedupeKey ?? null,
        metadata: input.metadata ?? null,
      },
    });

    return { job, duplicate: false };
  } catch (err: any) {
    if (err?.code === 'P2002' && input.dedupeKey) {
      const existing = await (prisma as any).emailJob.findUnique({
        where: { dedupeKey: input.dedupeKey },
      });
      return { job: existing, duplicate: true };
    }
    throw err;
  }
};

const smtpSend = async (toEmail: string, subject: string, htmlBody: string) => {
  const result = await sendEmail({
    to: toEmail,
    subject,
    html: htmlBody,
  });

  return result.messageId || null;
};

const markSent = async (id: number, providerMessageId: string | null) => {
  await (prisma as any).emailJob.update({
    where: { id },
    data: {
      status: 'SENT',
      sentAt: now(),
      lockedAt: null,
      lastError: null,
      providerMessageId,
      nextAttemptAt: null,
    },
  });
};

const markFailure = async (job: any, err: unknown) => {
  const attempts = (job.attempts ?? 0) + 1;
  const exhausted = attempts >= (job.maxAttempts ?? maxAttempts);

  await (prisma as any).emailJob.update({
    where: { id: job.id },
    data: {
      status: exhausted ? 'FAILED' : 'RETRY',
      lockedAt: null,
      lastError: err instanceof Error ? err.message.slice(0, 1900) : String(err).slice(0, 1900),
      nextAttemptAt: exhausted ? null : computeRetryAt(attempts),
    },
  });
};

const attemptImmediateDelivery = async (job: any) => {
  await (prisma as any).emailJob.update({
    where: { id: job.id },
    data: {
      status: 'PROCESSING',
      attempts: { increment: 1 },
      lastAttemptAt: now(),
      lockedAt: now(),
    },
  });

  try {
    const providerMessageId = await smtpSend(job.toEmail, job.subject, job.htmlBody);
    await markSent(job.id, providerMessageId);
    return { sent: 1, queued: 0, failed: 0 };
  } catch (err) {
    await markFailure(job, err);
    return { sent: 0, queued: 1, failed: 0 };
  }
};

export const dispatchEmail = async ({
  to,
  subject,
  html,
  category,
  mode = 'immediate',
  dedupeKey,
  metadata,
}: DispatchEmailInput) => {
  const recipients = asRecipients(to);

  if (recipients.length === 0) {
    return { queued: 0, sent: 0, duplicates: 0, failed: 0 };
  }

  let queued = 0;
  let sent = 0;
  let duplicates = 0;

  for (const recipient of recipients) {
    const resolvedDedupeKey =
      mode === 'bulk'
        ? buildBulkDedupeKey(category, recipient, subject, html, dedupeKey)
        : dedupeKey;

    const { job, duplicate } = await createEmailJob({
      toEmail: recipient,
      subject,
      htmlBody: html,
      category,
      mode: mode === 'bulk' ? 'BULK' : 'IMMEDIATE',
      priority: mode === 'bulk' ? bulkPriority : immediatePriority,
      dedupeKey: resolvedDedupeKey,
      metadata,
    });

    if (duplicate || !job) {
      duplicates += 1;
      continue;
    }

    queued += 1;

    if (mode === 'immediate') {
      const outcome = await attemptImmediateDelivery(job);
      sent += outcome.sent;
    }
  }

  return {
    queued,
    sent,
    duplicates,
    failed: 0,
  };
};

export const processEmailQueue = async (limit = 50) => {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 50;
  const startedAt = now();
  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);

  const jobs = await (prisma as any).emailJob.findMany({
    where: {
      OR: [
        {
          status: { in: ['PENDING', 'RETRY'] },
          nextAttemptAt: { lte: startedAt },
        },
        {
          status: 'PROCESSING',
          lockedAt: { lte: staleThreshold },
        },
      ],
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: safeLimit,
  });

  let processed = 0;
  let sent = 0;
  let failed = 0;
  let retried = 0;
  let skipped = 0;

  for (const job of jobs) {
    const claimed = await (prisma as any).emailJob.updateMany({
      where: {
        id: job.id,
        status: { in: ['PENDING', 'RETRY', 'PROCESSING'] },
      },
      data: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
        lastAttemptAt: now(),
        lockedAt: now(),
      },
    });

    if (claimed.count === 0) {
      skipped += 1;
      continue;
    }

    processed += 1;

    try {
      const providerMessageId = await smtpSend(job.toEmail, job.subject, job.htmlBody);
      await markSent(job.id, providerMessageId);
      sent += 1;
    } catch (err) {
      const attempts = (job.attempts ?? 0) + 1;
      const exhausted = attempts >= (job.maxAttempts ?? maxAttempts);

      await (prisma as any).emailJob.update({
        where: { id: job.id },
        data: {
          status: exhausted ? 'FAILED' : 'RETRY',
          lockedAt: null,
          lastError: err instanceof Error ? err.message.slice(0, 1900) : String(err).slice(0, 1900),
          nextAttemptAt: exhausted ? null : computeRetryAt(attempts),
        },
      });

      if (exhausted) failed += 1;
      else retried += 1;
    }
  }

  return {
    processed,
    sent,
    failed,
    retried,
    skipped,
  };
};

export const getEmailQueueSnapshot = async (params?: {
  status?: string;
  mode?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}) => {
  const page = Math.max(1, params?.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, params?.pageSize ?? 25));

  const where: Record<string, unknown> = {};
  if (params?.status && EMAIL_JOB_STATUSES.includes(params.status as EmailJobStatus)) {
    where.status = params.status;
  }
  if (params?.mode && ['IMMEDIATE', 'BULK'].includes(params.mode)) {
    where.mode = params.mode;
  }
  if (params?.category) {
    where.category = params.category;
  }

  const [items, total, grouped] = await Promise.all([
    (prisma as any).emailJob.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        toEmail: true,
        subject: true,
        category: true,
        mode: true,
        status: true,
        attempts: true,
        maxAttempts: true,
        nextAttemptAt: true,
        lastAttemptAt: true,
        sentAt: true,
        lastError: true,
        dedupeKey: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    (prisma as any).emailJob.count({ where }),
    (prisma as any).emailJob.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
  ]);

  const counts = EMAIL_JOB_STATUSES.reduce<Record<string, number>>((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {});

  grouped.forEach((row: any) => {
    counts[row.status] = row._count?._all ?? 0;
  });

  return {
    items,
    total,
    page,
    pageSize,
    counts,
  };
};
