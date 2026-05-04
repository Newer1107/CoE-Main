import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticate, errorRes, successRes } from '@/lib/api-helpers';
import {
  acceptBulkInternshipApplications,
  DecisionEngineError,
} from '@/lib/internship-applications';

const bodySchema = z
  .object({
    selectionMode: z.enum(['IDS', 'FILTERED']).default('IDS'),
    applicationIds: z.array(z.union([z.string().trim().min(1), z.number().int().positive()])).optional(),
    internshipTitle: z.string().trim().min(1).optional(),
    problemStatementId: z.coerce.number().int().positive().optional(),
    filters: z
      .object({
        internshipTitle: z.string().trim().min(1).optional(),
        problemStatementId: z.coerce.number().int().positive().optional(),
        search: z.string().trim().min(1).optional(),
        status: z.enum(['APPLIED', 'ACCEPTED', 'REJECTED']).optional(),
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

    if (
      parsed.data.selectionMode === 'IDS' &&
      !parsed.data.internshipTitle &&
      typeof parsed.data.problemStatementId !== 'number'
    ) {
      return errorRes('Validation failed', ['internshipTitle or problemStatementId is required.'], 400);
    }

    const result = await acceptBulkInternshipApplications({
      selectionMode: parsed.data.selectionMode,
      applicationIds: parsed.data.selectionMode === 'IDS' ? rawIds : undefined,
      filters: parsed.data.selectionMode === 'FILTERED' ? parsed.data.filters : undefined,
      internshipTitle: parsed.data.internshipTitle,
      problemStatementId: parsed.data.problemStatementId,
      user,
    });

    return successRes(result, 'Applications accepted and internship created.');
  } catch (err) {
    if (err instanceof DecisionEngineError) {
      return errorRes(err.message, err.details, err.status);
    }
    console.error('Accept bulk applications POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
