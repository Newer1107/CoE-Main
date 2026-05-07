import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import prisma from '@/lib/prisma';

const bodySchema = z
  .object({
    selectionMode: z.enum(['IDS', 'FILTERED']).default('IDS'),
    applicationIds: z.array(z.union([z.string().trim().min(1), z.number().int().positive()])).optional(),
    problemTitle: z.string().trim().min(1).optional(),
    problemId: z.coerce.number().int().positive().optional(),
    filters: z
      .object({
        problemTitle: z.string().trim().min(1).optional(),
        problemId: z.coerce.number().int().positive().optional(),
        search: z.string().trim().min(1).optional(),
        status: z.enum(['SUBMITTED', 'SELECTED', 'REJECTED']).optional(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.selectionMode === 'IDS' && (!data.applicationIds || data.applicationIds.length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'applicationIds are required for IDS mode' });
    }
    if (data.selectionMode === 'FILTERED' && !data.filters) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'filters are required for FILTERED mode' });
    }
  });

// POST /api/applications/accept-bulk
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);
    }

    const rawIds = (parsed.data.applicationIds ?? []).map((value) => Number(value));
    if (rawIds.some((value) => !Number.isInteger(value) || value <= 0)) {
      return errorRes('Validation failed', ['All applicationIds must be positive integers.'], 400);
    }

    if (!authorize(user, 'FACULTY', 'INDUSTRY_PARTNER', 'ADMIN')) {
      return errorRes('Forbidden', ['Faculty, industry partner, or admin access required'], 403);
    }

    if (
      parsed.data.selectionMode === 'IDS' &&
      typeof parsed.data.problemId !== 'number' &&
      !parsed.data.problemTitle
    ) {
      return errorRes('Validation failed', ['problemId or problemTitle is required.'], 400);
    }

    const resolveProblemIds = async (title?: string, explicitId?: number) => {
      if (typeof explicitId === 'number') return [explicitId];
      if (!title) return [];
      const problems = await prisma.problem.findMany({
        where: { title, problemType: 'INTERNSHIP' },
        select: { id: true },
      });
      return problems.map((row) => row.id);
    };

    const resolveIndustryFilter = async () => {
      if (authorize(user, 'ADMIN')) return null;
      if (user.role === 'INDUSTRY_PARTNER') {
        const industryId = typeof user.industryId === 'number' ? user.industryId : null;
        if (!industryId) {
          throw new Error('Industry context missing for this account');
        }
        return industryId;
      }
      return null;
    };

    const industryId = await resolveIndustryFilter().catch((err) => {
      if (err instanceof Error && err.message.includes('Industry context')) {
        throw new Error('Industry context missing for this account');
      }
      throw err;
    });

    const resolveSelection = async () => {
      if (parsed.data.selectionMode === 'FILTERED') {
        if (!parsed.data.filters) {
          throw new Error('Filters are required for filtered selection.');
        }

        if (!parsed.data.filters.problemTitle && typeof parsed.data.filters.problemId !== 'number') {
          throw new Error('problemTitle or problemId is required for filtered selection.');
        }

        if (parsed.data.filters.status && parsed.data.filters.status !== 'SUBMITTED') {
          throw new Error('Only SUBMITTED applications can be accepted.');
        }

        const problemIds = await resolveProblemIds(parsed.data.filters.problemTitle, parsed.data.filters.problemId);
        if (problemIds.length === 0) {
          throw new Error('No matching problem statements found.');
        }

        const where: Record<string, unknown> = {
          problemId: { in: problemIds },
          status: 'SUBMITTED',
          problem: { problemType: 'INTERNSHIP' },
        };

        if (industryId) {
          where.problem = { problemType: 'INTERNSHIP', industryId };
        }

        if (parsed.data.filters.search) {
          where.user = {
            OR: [
              { name: { contains: parsed.data.filters.search } },
              { email: { contains: parsed.data.filters.search } },
            ],
          };
        }

        const selected = await prisma.application.findMany({
          where,
          select: { id: true, userId: true, problemId: true, status: true },
        });

        if (selected.length === 0) {
          throw new Error('No applications match the filters.');
        }

        return selected;
      }

      const selected = await prisma.application.findMany({
        where: { id: { in: rawIds } },
        select: { id: true, userId: true, problemId: true, status: true },
      });

      if (selected.length !== rawIds.length) {
        throw new Error('One or more applications were not found.');
      }

      return selected;
    };

    const selected = await resolveSelection().catch((err) => {
      if (err instanceof Error) throw err;
      throw new Error('Invalid selection');
    });

    const problemIdSet = new Set(selected.map((row) => row.problemId));
    if (problemIdSet.size !== 1) {
      return errorRes('Mixed problem statements', ['Select applications from a single problem statement.'], 400);
    }

    const selectedProblemId = selected[0].problemId;

    if (parsed.data.problemId && parsed.data.problemId !== selectedProblemId) {
      return errorRes('Problem mismatch', ['Problem statement does not match selection.'], 400);
    }

    if (selected.some((row) => row.status !== 'SUBMITTED')) {
      return errorRes('Invalid selection', ['Selected applications must all be in SUBMITTED status.'], 409);
    }

    if (industryId) {
      const problem = await prisma.problem.findUnique({
        where: { id: selectedProblemId },
        select: { industryId: true },
      });
      if (!problem || problem.industryId !== industryId) {
        return errorRes('Forbidden', ['You can only accept applications for your internships.'], 403);
      }
    }

    const allApplications = await prisma.application.findMany({
      where: {
        problemId: selectedProblemId,
        status: 'SUBMITTED',
      },
      select: { id: true },
    });

    const acceptedCount = selected.length;
    const rejectedCount = allApplications.length - acceptedCount;

    const updatedAccepted = await prisma.application.updateMany({
      where: { id: { in: selected.map((row) => row.id) }, status: 'SUBMITTED' },
      data: { status: 'SELECTED' },
    });

    if (updatedAccepted.count !== acceptedCount) {
      return errorRes('Concurrent update detected', ['Some applications were modified before acceptance completed.'], 409);
    }

    await prisma.application.updateMany({
      where: {
        id: { notIn: selected.map((row) => row.id) },
        problemId: selectedProblemId,
        status: 'SUBMITTED',
      },
      data: { status: 'REJECTED' },
    });

    return successRes(
      { problemId: selectedProblemId, acceptedCount, rejectedCount },
      'Applications accepted and cohort finalized.'
    );
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes('Industry context')) {
        return errorRes('Forbidden', ['Industry context missing for this account'], 403);
      }
      return errorRes(err.message, [], 400);
    }
    console.error('Accept bulk applications POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
