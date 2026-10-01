import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { authenticate, successRes, errorRes } from '@/lib/api-helpers';
import { getRegistrationStatus, getEventStatus } from '@/lib/hackathon-hub';
import { kmFromTcet } from '@/lib/hub/pipeline';

// GET /api/hackathon-hub — public student listing (Phase 1, spec §28-29)
// Filters: search, city, mode, domain (themes), month (YYYY-MM), regStatus, eventStatus, sort
export async function GET(req: NextRequest) {
  try {
    const user = authenticate(req);
    const { searchParams } = req.nextUrl;
    const search = searchParams.get('search')?.trim() || undefined;
    const city = searchParams.get('city')?.trim() || undefined;
    const mode = searchParams.get('mode')?.trim().toUpperCase() || undefined;
    const domain = searchParams.get('domain')?.trim() || undefined;
    const month = searchParams.get('month')?.trim() || undefined; // YYYY-MM
    const regStatusFilter = searchParams.get('regStatus')?.trim().toUpperCase() || undefined;
    const eventStatusFilter = searchParams.get('eventStatus')?.trim().toUpperCase() || undefined;
    const sort = searchParams.get('sort') === 'deadline' ? 'deadline' : 'newest';

    const where: Prisma.OpportunityWhereInput = {
      status: 'APPROVED',
      showInHub: true,
      ...(city ? { city: { equals: city } } : {}),
      ...(mode && ['ONLINE', 'OFFLINE', 'HYBRID'].includes(mode) ? { mode } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search } },
              { organizer: { contains: search } },
              { description: { contains: search } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.OpportunityOrderByWithRelationInput[] =
      sort === 'deadline'
        ? [{ registrationDeadline: 'asc' }, { createdAt: 'desc' }]
        : [{ createdAt: 'desc' }];

    const rows = await prisma.opportunity.findMany({ where, orderBy, take: 200 });

    const now = new Date();
    let enriched = rows.map((opp) => ({
      ...opp,
      regStatus: getRegistrationStatus(
        opp.registrationDeadline ?? (opp as { startDate?: Date | null }).startDate ?? null,
        now,
      ),
      eventStatus: getEventStatus(
        (opp as { startDate?: Date | null }).startDate ?? null,
        (opp as { endDate?: Date | null }).endDate ?? null,
        now,
      ),
    }));

    if (domain) {
      const q = domain.toLowerCase();
      enriched = enriched.filter((opp) => {
        const themes = Array.isArray(opp.themes) ? (opp.themes as string[]) : [];
        const techs = Array.isArray(opp.technologies) ? (opp.technologies as string[]) : [];
        return [...themes, ...techs].some((t) => String(t).toLowerCase().includes(q));
      });
    }

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      enriched = enriched.filter((opp) => {
        const anchor =
          (opp as { startDate?: Date | null }).startDate ?? opp.registrationDeadline ?? opp.createdAt;
        const d = anchor ? new Date(anchor) : null;
        if (!d || Number.isNaN(d.getTime())) return false;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === month;
      });
    }

    if (regStatusFilter && ['OPEN', 'CLOSING_SOON', 'CLOSED'].includes(regStatusFilter)) {
      enriched = enriched.filter((opp) => opp.regStatus === regStatusFilter);
    }
    if (eventStatusFilter && ['UPCOMING', 'ONGOING', 'COMPLETED'].includes(eventStatusFilter)) {
      enriched = enriched.filter((opp) => opp.eventStatus === eventStatusFilter);
    }

    let myInterestMap = new Map<number, { status: string }>();
    if (user && enriched.length > 0) {
      const interests = await prisma.opportunityInterest.findMany({
        where: { userId: user.id, opportunityId: { in: enriched.map((o) => o.id) } },
        select: { opportunityId: true, status: true },
      });
      myInterestMap = new Map(interests.map((i) => [i.opportunityId, { status: i.status }]));
    }

    const payload = enriched.map((opp) => {
      // No-guess rule lives in the DB (NULL stays NULL). For display only,
      // fall back to the start date so cards don't read UNKNOWN — flagged
      // via regStatusSource so the UI can mark it unconfirmed.
      const startDate = (opp as { startDate?: Date | null }).startDate ?? null;
      const statusSource = opp.registrationDeadline ? 'deadline' : startDate ? 'startDate' : 'none';
      const distanceKm = kmFromTcet((opp as { city?: string | null }).city ?? null);
      return {
        ...opp,
        myInterest: user ? myInterestMap.get(opp.id) ?? null : null,
        regStatusSource: statusSource,
        distanceKm,
        distanceLabel:
          (opp as { mode?: string | null }).mode === 'ONLINE'
            ? 'Online'
            : distanceKm == null
              ? null
              : `${distanceKm} km from TCET`,
      };
    });

    return successRes(payload, 'Hackathon hub events retrieved successfully.');
  } catch (err) {
    console.error('Hackathon hub GET error:', err);
    return errorRes('Internal server error', [], 500);
  }
}
