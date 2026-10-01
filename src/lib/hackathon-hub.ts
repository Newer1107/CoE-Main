/**
 * Hackathon Hub helpers — Phase 1.
 * ponytail: auto status only; dedupe/conflict/change-detection land in Phase 3+.
 * Spec §17: registration + event status derived from dates, never stored.
 */

export type HubRegistrationStatus = 'OPEN' | 'CLOSING_SOON' | 'CLOSED' | 'UNKNOWN';
export type HubEventStatus = 'UPCOMING' | 'ONGOING' | 'COMPLETED' | 'UNKNOWN';

export const HUB_SOURCE_TYPES = [
  'OFFICIAL_WEBSITE',
  'DEVFOLIO',
  'UNSTOP',
  'HACKEREARTH',
  'HACK2SKILL',
  'MLH',
  'COLLEGE_WEBSITE',
  'INDIAHACKATHONS',
  'GOVERNMENT',
  'SOCIAL_MEDIA',
  'ADMIN',
  'GOOGLE_SHEET',
  'OTHER',
] as const;

export const HUB_VERIFICATION_STATES = [
  'UNVERIFIED',
  'PLATFORM_VERIFIED',
  'OFFICIAL_SOURCE',
  'ADMIN_VERIFIED',
  'VERIFIED',
] as const;

export const HUB_MODES = ['ONLINE', 'OFFLINE', 'HYBRID'] as const;

export function getRegistrationStatus(deadline: Date | string | null | undefined, now = new Date()): HubRegistrationStatus {
  if (!deadline) return 'UNKNOWN';
  const d = deadline instanceof Date ? deadline : new Date(deadline);
  if (Number.isNaN(d.getTime())) return 'UNKNOWN';
  const t = now.getTime();
  if (d.getTime() < t) return 'CLOSED';
  if (d.getTime() <= t + 7 * 86_400_000) return 'CLOSING_SOON';
  return 'OPEN';
}

export function getEventStatus(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
  now = new Date(),
): HubEventStatus {
  const s = start ? (start instanceof Date ? start : new Date(start)) : null;
  const e = end ? (end instanceof Date ? end : new Date(end)) : null;
  if (!s || Number.isNaN(s.getTime())) return 'UNKNOWN';
  const t = now.getTime();
  if (s.getTime() > t) return 'UPCOMING';
  if (e && !Number.isNaN(e.getTime())) {
    if (t <= e.getTime()) return 'ONGOING';
    return 'COMPLETED';
  }
  // No end date: treat start day as single-day event
  return t - s.getTime() < 86_400_000 ? 'ONGOING' : 'COMPLETED';
}

export function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
// ponytail: dedupe uses exact normalized-name equality (URL match is the
// primary key). Year-suffixed variants intentionally do NOT merge — safer
// than fusing distinct yearly editions; admin merges those via publish.
// Upgrade path: trigram similarity + same-organizer+date window.

// DB boundary: Opportunity text columns are VARCHAR(191). Clip at the single
// choke point instead of letting MySQL throw P2000 from every writer.
export function clipDbString(value: string | null | undefined, max = 191): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

// URLs can't be clipped without corrupting them — NULL when unstoreable.
export function fitUrl(value: string | null | undefined, max = 191): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

// Hub subset boundary: which Opportunity categories belong in the Hackathon
// Hub. Used to auto-set showInHub on submit/import; admin toggle overrides.
const HUB_CATEGORY_HINTS = [
  'hackathon', 'competition', 'contest', 'ideathon', 'datathon',
  'codefest', 'hackfest', 'challenge',
];

export function isHubCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  const c = category.toLowerCase();
  return HUB_CATEGORY_HINTS.some((hint) => c.includes(hint));
}
