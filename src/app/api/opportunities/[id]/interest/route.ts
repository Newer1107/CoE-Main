import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { opportunityInterestSchema } from '@/lib/validators';

const parseOpportunityId = (raw: string): number => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : NaN;
};

// POST /api/opportunities/[id]/interest — save/express interest
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const { id } = await params;
    const opportunityId = parseOpportunityId(id);
    if (Number.isNaN(opportunityId)) return errorRes('Invalid opportunity id', [], 400);

    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: { id: true },
    });
    if (!opportunity) return errorRes('Opportunity not found', [], 404);

    const body = await req.json();
    const parsed = opportunityInterestSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const interest = await prisma.opportunityInterest.upsert({
      where: {
        userId_opportunityId: {
          userId: user.id,
          opportunityId,
        },
      },
      create: {
        userId: user.id,
        opportunityId,
        status: parsed.data.status,
      },
      update: {
        status: parsed.data.status,
      },
    });

    return successRes(interest, 'Interest updated successfully.');
  } catch (err) {
    console.error('Opportunity interest POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// DELETE /api/opportunities/[id]/interest — remove saved interest
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'STUDENT')) return errorRes('Forbidden', ['Student access required'], 403);

    const { id } = await params;
    const opportunityId = parseOpportunityId(id);
    if (Number.isNaN(opportunityId)) return errorRes('Invalid opportunity id', [], 400);

    await prisma.opportunityInterest.deleteMany({
      where: {
        userId: user.id,
        opportunityId,
      },
    });

    return successRes(null, 'Interest removed successfully.');
  } catch (err) {
    console.error('Opportunity interest DELETE error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
