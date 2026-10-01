import prisma from '@/lib/prisma';
import { normalizeName, getRegistrationStatus, getEventStatus, clipDbString, fitUrl } from '@/lib/hackathon-hub';
import type { ExtractedEvent } from './extract';
import { mandatoryMissing } from './extract';

// Promotion: VERIFIED candidate → Opportunity (§18 VERIFIED→PUBLISHED).
// R12: never auto-publish incomplete rows; publish is an explicit admin act.
export async function publishCandidate(candidateId: number, actorId: number) {
  const candidate = await (prisma as any).hubCandidate.findUnique({ where: { id: candidateId } });
  if (!candidate) throw new Error('Candidate not found');
  if (!['VERIFIED', 'NEEDS_REVIEW', 'NEEDS_UPDATE'].includes(candidate.status)) {
    throw new Error(`Cannot publish from status ${candidate.status}`);
  }
  const e = (candidate.extracted ?? {}) as Partial<ExtractedEvent>;
  // Admin clicking Publish IS the human verification (§36.3): missing fields
  // stay NULL (§41.1) instead of blocking. Only title is truly required.
  const missing = mandatoryMissing(e as ExtractedEvent);
  if (!e.eventName && !candidate.title) {
    throw new Error(`Nothing to publish — missing: ${missing.join(', ')}`);
  }

  const title = e.eventName ?? candidate.title ?? 'Untitled hackathon';
  const organizer = e.organiser ?? 'Unknown organizer';

  // Dedupe (§16): URL first, then normalized name+organizer (skipped when unknown).
  let existing: { id: number } | null = null;
  if (e.registrationUrl) {
    existing =
      (await (prisma as any).opportunity.findFirst({ where: { sourceUrl: e.registrationUrl } })) ??
      (await (prisma as any).opportunity.findFirst({ where: { applicationUrl: e.registrationUrl } }));
  }
  if (!existing && e.organiser && e.eventName) {
    const rivals = await (prisma as any).opportunity.findMany({
      where: { organizer: e.organiser },
      select: { id: true, title: true },
      take: 50,
    });
    existing = rivals.find((r: { title: string }) => normalizeName(r.title) === normalizeName(e.eventName as string)) ?? null;
  }

  const record = {
    title: clipDbString(title) as string,
    category: 'Hackathon',
    organizer: clipDbString(organizer) as string,
    description: missing.length > 0 ? `Auto-published with missing fields: ${missing.join(', ')} — verify on the official page.` : null,
    registrationDeadline: e.registrationDeadline ? new Date(e.registrationDeadline) : null,
    eligibility: clipDbString(e.eligibility),
    prize: clipDbString(e.prizePool),
    themes: e.domains?.length ? e.domains : undefined,
    applicationUrl: fitUrl(e.registrationUrl),
    mode: e.mode ?? null,
    venue: clipDbString(e.venue),
    city: clipDbString(e.city),
    state: clipDbString(e.state),
    startDate: e.startDate ? new Date(e.startDate) : null,
    endDate: e.endDate ? new Date(e.endDate) : null,
    teamMin: e.teamMin ?? null,
    teamMax: e.teamMax ?? null,
    sourceUrl: candidate.url,
    sourceType: candidate.sourceType,
    verificationStatus: 'ADMIN_VERIFIED',
    lastVerifiedAt: new Date(),
    pageHash: candidate.pageHash ?? null,
  };

  let opportunityId: number;
  if (existing) {
    const updated = await (prisma as any).opportunity.update({
      where: { id: existing.id },
      data: { ...record, status: 'APPROVED', showInHub: true },
    });
    opportunityId = updated.id;
  } else {
    const created = await (prisma as any).opportunity.create({
      data: { ...record, status: 'APPROVED', showInHub: true, createdById: actorId },
    });
    opportunityId = created.id;
  }

  await (prisma as any).hubCandidate.update({
    where: { id: candidateId },
    data: { status: 'PUBLISHED', opportunityId, error: null },
  });
  return { opportunityId, merged: Boolean(existing) };
}

// Change detection (§21): re-hash source pages; on hash drift, re-extract and
// diff important fields. Important-field drift → NEEDS_UPDATE + admin notify.
export const IMPORTANT_FIELDS = [
  'registrationDeadline', 'prize', 'eligibility', 'teamMin', 'teamMax', 'venue', 'startDate', 'endDate',
] as const;

export function diffImportant(
  current: Record<string, unknown>,
  fresh: Record<string, unknown>,
): { field: string; from: unknown; to: unknown }[] {
  const diffs: { field: string; from: unknown; to: unknown }[] = [];
  for (const field of IMPORTANT_FIELDS) {
    const a = current[field] instanceof Date ? (current[field] as Date).toISOString() : (current[field] ?? null);
    const b = fresh[field] instanceof Date ? (fresh[field] as Date).toISOString() : (fresh[field] ?? null);
    if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push({ field, from: a, to: b });
  }
  return diffs;
}

// Admin dashboard rollup (§39).
export async function hubStats() {
  const [opportunities, candidates] = await Promise.all([
    (prisma as any).opportunity.findMany({
      select: { id: true, registrationDeadline: true, startDate: true, endDate: true, createdAt: true, status: true },
      take: 1000,
    }),
    (prisma as any).hubCandidate.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  let active = 0, closingSoon = 0, expired = 0, newThisWeek = 0;
  for (const o of opportunities) {
    if (o.status !== 'APPROVED') continue;
    const reg = getRegistrationStatus(o.registrationDeadline, now);
    const ev = getEventStatus(o.startDate ?? null, o.endDate ?? null, now);
    if (reg === 'OPEN' || reg === 'CLOSING_SOON') active++;
    if (reg === 'CLOSING_SOON') closingSoon++;
    if (ev === 'COMPLETED') expired++;
    if (new Date(o.createdAt) >= weekAgo) newThisWeek++;
  }
  const needsReview = candidates
    .filter((c: { status: string }) => ['NEEDS_REVIEW', 'NEEDS_UPDATE'].includes(c.status))
    .reduce((n: number, c: { _count: { _all: number } }) => n + c._count._all, 0);
  return {
    totalEvents: opportunities.length,
    active, closingSoon, needsReview, expired, newThisWeek,
    byStatus: candidates,
  };
}

// Distance from TCET (§37–38, Phase 2-lite: known-city Haversine, display only).
const TCET = { lat: 19.2066, lon: 72.8735 };
const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  'mumbai': { lat: 19.076, lon: 72.8777 },
  'navi mumbai': { lat: 19.033, lon: 73.0297 },
  'thane': { lat: 19.2183, lon: 72.9781 },
  'pune': { lat: 18.5204, lon: 73.8567 },
  'nagpur': { lat: 21.1458, lon: 79.0882 },
  'nashik': { lat: 19.9975, lon: 73.7898 },
  'chhatrapati sambhajinagar': { lat: 19.8762, lon: 75.3433 },
  'kolhapur': { lat: 16.705, lon: 74.2433 },
  'delhi': { lat: 28.6139, lon: 77.209 },
  'bengaluru': { lat: 12.9716, lon: 77.5946 },
  'hyderabad': { lat: 17.385, lon: 78.4867 },
  'chennai': { lat: 13.0827, lon: 80.2707 },
  'kolkata': { lat: 22.5726, lon: 88.3639 },
  'ahmedabad': { lat: 23.0225, lon: 72.5714 },
  'jaipur': { lat: 26.9124, lon: 75.7873 },
  'chandigarh': { lat: 30.7333, lon: 76.7794 },
  'indore': { lat: 22.7196, lon: 75.8577 },
  'kochi': { lat: 9.9312, lon: 76.2673 },
  'guwahati': { lat: 26.1445, lon: 91.7362 },
  'srivilliputhur': { lat: 9.5125, lon: 77.6336 },
};

export function kmFromTcet(city: string | null): number | null {
  if (!city) return null;
  const coords = CITY_COORDS[city.trim().toLowerCase()];
  if (!coords) return null;
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(coords.lat - TCET.lat);
  const dLon = toRad(coords.lon - TCET.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(TCET.lat)) * Math.cos(toRad(coords.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
}
