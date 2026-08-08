import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { opportunityStatusSchema, opportunityUpdateSchema } from '@/lib/validators';

const parseOpportunityId = (raw: string): number => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : NaN;
};

// PATCH /api/admin/opportunities/[id] — approve/reject or partial update
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { id } = await params;
    const opportunityId = parseOpportunityId(id);
    if (Number.isNaN(opportunityId)) return errorRes('Invalid opportunity id', [], 400);

    const existing = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
    if (!existing) return errorRes('Opportunity not found', [], 404);

    const body = await req.json();

    // Allow either { status } only, or partial field updates.
    const keys = Object.keys(body);
    const isStatusOnly = keys.length === 1 && 'status' in body;
    const schema = isStatusOnly ? opportunityStatusSchema : opportunityUpdateSchema;
    const parsed = schema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const data = parsed.data as Record<string, unknown>;
    const updateData: Record<string, unknown> = {};

    if (typeof data.status !== 'undefined') updateData.status = data.status;
    if (typeof data.title !== 'undefined') updateData.title = data.title;
    if (typeof data.category !== 'undefined') updateData.category = data.category;
    if (typeof data.organizer !== 'undefined') updateData.organizer = data.organizer;
    if (typeof data.description !== 'undefined') updateData.description = data.description || null;
    if (typeof data.registrationDeadline !== 'undefined') {
      updateData.registrationDeadline = data.registrationDeadline ? new Date(data.registrationDeadline as string) : null;
    }
    if (typeof data.eligibility !== 'undefined') updateData.eligibility = data.eligibility || null;
    if (typeof data.prize !== 'undefined') updateData.prize = data.prize || null;
    if (typeof data.themes !== 'undefined') updateData.themes = Array.isArray(data.themes) ? data.themes : undefined;
    if (typeof data.technologies !== 'undefined') {
      updateData.technologies = Array.isArray(data.technologies) ? data.technologies : undefined;
    }
    if (typeof data.applicationUrl !== 'undefined') updateData.applicationUrl = data.applicationUrl || null;
    if (typeof data.facultyRecommended !== 'undefined') updateData.facultyRecommended = data.facultyRecommended;

    if (Object.keys(updateData).length === 0) {
      return errorRes('No fields to update', [], 400);
    }

    const updated = await prisma.opportunity.update({
      where: { id: opportunityId },
      data: updateData,
    });

    return successRes(updated, 'Opportunity updated successfully.');
  } catch (err) {
    console.error('Admin opportunity PATCH error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// DELETE /api/admin/opportunities/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN')) return errorRes('Forbidden', ['Admin access required'], 403);

    const { id } = await params;
    const opportunityId = parseOpportunityId(id);
    if (Number.isNaN(opportunityId)) return errorRes('Invalid opportunity id', [], 400);

    const existing = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
    if (!existing) return errorRes('Opportunity not found', [], 404);

    await prisma.opportunity.delete({ where: { id: opportunityId } });
    return successRes(null, 'Opportunity deleted successfully.');
  } catch (err) {
    console.error('Admin opportunity DELETE error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
