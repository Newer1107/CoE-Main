import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { authenticate, authorize, errorRes, successRes } from '@/lib/api-helpers';
import { opportunityCreateSchema } from '@/lib/validators';

// GET /api/opportunities — public browse
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    const isAdmin = user ? authorize(user, 'ADMIN') : false;

    const { searchParams } = req.nextUrl;
    const category = searchParams.get('category')?.trim() || undefined;
    const search = searchParams.get('search')?.trim() || undefined;
    const sort = searchParams.get('sort') === 'deadline' ? 'deadline' : 'newest';
    const statusParam = searchParams.get('status')?.trim() || undefined;

    // Non-admin users only ever see approved opportunities; admins may filter by
    // status (or see everything when no status filter is provided).
    const statusFilter = isAdmin ? statusParam : 'APPROVED';

    const where = {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(category ? { category } : {}),
      ...(search
        ? {
            OR: [{ title: { contains: search } }, { organizer: { contains: search } }],
          }
        : {}),
    };

    const orderBy: Prisma.OpportunityOrderByWithRelationInput | Prisma.OpportunityOrderByWithRelationInput[] =
      sort === 'deadline'
        ? [{ registrationDeadline: 'asc' }, { createdAt: 'desc' }]
        : [{ createdAt: 'desc' }];

    const opportunities = await prisma.opportunity.findMany({ where, orderBy });

    let myInterestMap = new Map<number, { status: string }>();
    if (user) {
      const interests = await prisma.opportunityInterest.findMany({
        where: {
          userId: user.id,
          opportunityId: { in: opportunities.map((opp) => opp.id) },
        },
        select: { opportunityId: true, status: true },
      });
      myInterestMap = new Map(
        interests.map((interest) => [interest.opportunityId, { status: interest.status }]),
      );
    }

    const payload = opportunities.map((opportunity) => ({
      ...opportunity,
      myInterest: user ? myInterestMap.get(opportunity.id) ?? null : null,
    }));

    return successRes(payload, 'Opportunities retrieved successfully.');
  } catch (err) {
    console.error('Opportunities GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}

// POST /api/opportunities — admin/faculty create
export async function POST(req: NextRequest) {
  try {
    const user = authenticate(req);
    if (!user) return errorRes('Unauthorized', [], 401);
    if (!authorize(user, 'ADMIN', 'FACULTY')) return errorRes('Forbidden', [], 403);

    const body = await req.json();
    const parsed = opportunityCreateSchema.safeParse(body);
    if (!parsed.success) return errorRes('Validation failed', parsed.error.issues.map((issue) => issue.message), 400);

    const data = parsed.data;
    const opportunity = await prisma.opportunity.create({
      data: {
        title: data.title,
        category: data.category,
        organizer: data.organizer,
        description: data.description || null,
        registrationDeadline: data.registrationDeadline ? new Date(data.registrationDeadline) : null,
        eligibility: data.eligibility || null,
        prize: data.prize || null,
        themes: data.themes && data.themes.length > 0 ? data.themes : undefined,
        technologies: data.technologies && data.technologies.length > 0 ? data.technologies : undefined,
        applicationUrl: data.applicationUrl || null,
        facultyRecommended: data.facultyRecommended ?? false,
        status: 'PENDING',
        createdById: user.id,
      },
    });

    return successRes(opportunity, 'Opportunity created and submitted for review.', 201);
  } catch (err) {
    console.error('Opportunities POST error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
