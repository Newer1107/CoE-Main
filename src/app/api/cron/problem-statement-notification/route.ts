import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { sendNewProblemStatementEmail } from '@/lib/mailer';
import { processEmailQueue } from '@/lib/email-delivery';
import { NextRequest } from 'next/server';

type ProblemWithCreator = Prisma.ProblemGetPayload<{
  include: { createdBy: true };
}>;

const isAuthorizedCron = (req: NextRequest) => {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  const providedSecret = (req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret') || '').trim();

  if (expectedSecret) {
    return providedSecret === expectedSecret;
  }

  const user = authenticate(req);
  return Boolean(user && authorize(user, 'ADMIN'));
};

// GET /api/cron/problem-statement-notification
export async function GET(req: NextRequest) {
  try {
    if (!isAuthorizedCron(req)) {
      return errorRes('Forbidden', ['Invalid cron secret or admin credentials required'], 403);
    }

    // Find all unnotified open problem statements
    const unnotifiedProblems = (await prisma.problem.findMany({
      where: {
        notificationSent: false as any,
        mode: 'OPEN',
        status: 'OPENED',
        eventId: null, // Only standalone problems, not hackathon-linked
      },
      include: {
        createdBy: true,
      },
      orderBy: { createdAt: 'asc' },
    })) as ProblemWithCreator[];

    if (unnotifiedProblems.length === 0) {
      return successRes(
        { processedProblems: 0, emailsDispatched: 0, errors: [] },
        'No new problem statements to notify.'
      );
    }

    // Fetch all active verified students
    const students = await prisma.user.findMany({
      where: {
        role: 'STUDENT',
        status: 'ACTIVE',
        isVerified: true,
      },
      select: { email: true },
    });

    const studentEmails = students.map((s) => s.email);

    if (studentEmails.length === 0) {
      return successRes(
        { processedProblems: 0, emailsDispatched: 0, errors: [] },
        'No active verified students to notify.'
      );
    }

    let processedCount = 0;
    let emailsDispatchedCount = 0;
    const errors: string[] = [];

    // Process each problem and send bulk notification
    for (const problem of unnotifiedProblems) {
      try {
        await sendNewProblemStatementEmail(studentEmails, {
          problemTitle: problem.title,
          problemDescription: problem.description,
          tags: problem.tags,
          createdBy: problem.createdBy.name,
          problemId: problem.id,
        });

        emailsDispatchedCount += studentEmails.length;

        // Mark problem as notified
        await prisma.problem.update({
          where: { id: problem.id },
          data: { notificationSent: true as any },
        });

        processedCount += 1;
        console.log(`Problem statement notification sent: ${problem.id} - ${problem.title}`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to notify for problem ${problem.id}: ${errorMsg}`);
        console.error(`Problem statement notification failed for ${problem.id}:`, err);
      }
    }

    // Drain email queue gradually
    try {
      await processEmailQueue(50);
    } catch (queueErr) {
      console.error('Email queue drain after problem statement notification failed:', queueErr);
    }

    return successRes(
      {
        processedProblems: processedCount,
        emailsDispatched: emailsDispatchedCount,
        errors,
      },
      'Problem statement notification cron executed successfully.'
    );
  } catch (err) {
    console.error('Problem statement notification cron error:', err);
    return errorRes(
      'Internal server error',
      [err instanceof Error ? err.message : 'Unknown error'],
      500
    );
  }
}
