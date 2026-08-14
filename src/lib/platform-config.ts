import prisma from '@/lib/prisma';

// ----------------------------------------
// Site-level configuration for the innovation & competitions platform.
//
// The default configuration below is static code; administrators can
// override individual values through the `site_settings` table (see the
// admin route at /api/admin/hackathons-config). Settings are stored with
// dot-path keys that mirror the PlatformConfig shape, e.g.
//   'identity.platformName'  -> identity.platformName
//   'taxonomy.departments'   -> taxonomy.departments
//   'flags.tickets'          -> flags.tickets
// getPlatformConfig() deep-merges the DB rows over DEFAULT_CONFIG and
// caches the result briefly (module-level TTL) to avoid a DB hit on every
// render.
// ----------------------------------------

// ── Types ----------------------------------------

export type EventDefaultConfig = {
  registration: {
    requiresPpt: boolean;
    requiresProblemSelection: boolean;
    minTeamSize: number;
    maxTeamSize: number;
    allowSolo: boolean;
    allowOpenInnovation?: boolean; // custom problem statements (SIH open-innovation track)
  };
  submission: {
    allowUrl: boolean;
    allowFile: boolean;
  };
  rubrics: {
    template: string;
  };
  certificates: {
    issueOnAccept: boolean;
  };
  leaderboard: {
    visibleAfter: 'CLOSED' | 'LIVE';
  };
  ticketing: {
    enabled: boolean;
  };
  emails: {
    enabled: boolean;
  };
};

export type EventTypeDef = {
  key: string;
  label: string;
  defaultConfig: EventDefaultConfig;
};

export type RubricTemplate = {
  key: string;
  label: string;
  categories: { key: string; label: string; weight: number }[];
};

export type PlatformConfig = {
  identity: {
    platformName: string;
    heroBanner: string | null;
    featuredEvents: number[];
  };
  taxonomy: {
    eventTypes: EventTypeDef[];
    departments: string[];
    tags: string[];
  };
  rubrics: {
    templates: RubricTemplate[];
  };
  flags: {
    certificates: boolean;
    tickets: boolean;
    externalRepo: boolean;
    learningHub: boolean;
  };
};

// ── Rubric templates ----------------------------------------

export const RUBRIC_TEMPLATES: RubricTemplate[] = [
  {
    key: 'sih-7',
    label: 'SIH 7-Category',
    categories: [
      { key: 'innovation', label: 'Innovation', weight: 15 },
      { key: 'technical', label: 'Technical', weight: 20 },
      { key: 'impact', label: 'Impact', weight: 15 },
      { key: 'ux', label: 'UX & Design', weight: 10 },
      { key: 'execution', label: 'Execution', weight: 20 },
      { key: 'presentation', label: 'Presentation', weight: 10 },
      { key: 'feasibility', label: 'Feasibility', weight: 10 },
    ],
  },
  {
    key: 'coding-3',
    label: 'Coding 3-Category',
    categories: [
      { key: 'correctness', label: 'Correctness', weight: 60 },
      { key: 'efficiency', label: 'Efficiency', weight: 25 },
      { key: 'presentation', label: 'Presentation', weight: 15 },
    ],
  },
  {
    key: 'design-4',
    label: 'Design 4-Category',
    categories: [
      { key: 'aesthetics', label: 'Aesthetics', weight: 30 },
      { key: 'usability', label: 'Usability', weight: 30 },
      { key: 'feasibility', label: 'Feasibility', weight: 20 },
      { key: 'presentation', label: 'Presentation', weight: 20 },
    ],
  },
  {
    key: 'exhibition-5',
    label: 'Exhibition 5-Category',
    categories: [
      { key: 'innovation', label: 'Innovation', weight: 25 },
      { key: 'technical', label: 'Technical', weight: 25 },
      { key: 'completeness', label: 'Completeness', weight: 20 },
      { key: 'presentation', label: 'Presentation', weight: 15 },
      { key: 'feasibility', label: 'Feasibility', weight: 15 },
    ],
  },
  {
    key: 'research-4',
    label: 'Research 4-Category',
    categories: [
      { key: 'novelty', label: 'Novelty', weight: 30 },
      { key: 'methodology', label: 'Methodology', weight: 30 },
      { key: 'rigour', label: 'Rigour', weight: 20 },
      { key: 'presentation', label: 'Presentation', weight: 20 },
    ],
  },
  {
    key: 'paper-3',
    label: 'Paper 3-Category',
    categories: [
      { key: 'content', label: 'Content', weight: 50 },
      { key: 'clarity', label: 'Clarity', weight: 30 },
      { key: 'presentation', label: 'Presentation', weight: 20 },
    ],
  },
  {
    key: 'case-4',
    label: 'Case 4-Category',
    categories: [
      { key: 'analysis', label: 'Analysis', weight: 35 },
      { key: 'solution-quality', label: 'Solution Quality', weight: 35 },
      { key: 'presentation', label: 'Presentation', weight: 15 },
      { key: 'qna', label: 'Q&A', weight: 15 },
    ],
  },
];

// ── Event types ----------------------------------------

type DefaultsOverrides = {
  registration?: Partial<EventDefaultConfig['registration']>;
  submission?: Partial<EventDefaultConfig['submission']>;
  certificates?: Partial<EventDefaultConfig['certificates']>;
  leaderboard?: Partial<EventDefaultConfig['leaderboard']>;
  ticketing?: Partial<EventDefaultConfig['ticketing']>;
  emails?: Partial<EventDefaultConfig['emails']>;
  rubrics: { template: string };
};

const makeDefaults = (partial: DefaultsOverrides): EventDefaultConfig => ({
  registration: {
    requiresPpt: false,
    requiresProblemSelection: false,
    minTeamSize: 1,
    maxTeamSize: 4,
    allowSolo: true,
    ...partial.registration,
  },
  submission: {
    allowUrl: true,
    allowFile: true,
    ...partial.submission,
  },
  rubrics: partial.rubrics,
  certificates: {
    issueOnAccept: true,
    ...partial.certificates,
  },
  leaderboard: {
    visibleAfter: 'CLOSED',
    ...partial.leaderboard,
  },
  ticketing: {
    enabled: false,
    ...partial.ticketing,
  },
  emails: {
    enabled: true,
    ...partial.emails,
  },
});

export const EVENT_TYPES: EventTypeDef[] = [
  {
    key: 'hackathon',
    label: 'Hackathon',
    defaultConfig: makeDefaults({
      registration: { requiresPpt: true, requiresProblemSelection: true, maxTeamSize: 5 },
      rubrics: { template: 'sih-7' },
      certificates: { issueOnAccept: false },
    }),
  },
  {
    key: 'coding-competition',
    label: 'Coding Competition',
    defaultConfig: makeDefaults({
      registration: { maxTeamSize: 3 },
      submission: { allowFile: false },
      rubrics: { template: 'coding-3' },
      leaderboard: { visibleAfter: 'LIVE' },
    }),
  },
  {
    key: 'design-challenge',
    label: 'Design Challenge',
    defaultConfig: makeDefaults({
      registration: { requiresPpt: true, requiresProblemSelection: true, maxTeamSize: 4 },
      rubrics: { template: 'design-4' },
    }),
  },
  {
    key: 'project-exhibition',
    label: 'Project Exhibition',
    defaultConfig: makeDefaults({
      registration: { requiresPpt: true, maxTeamSize: 5 },
      submission: { allowFile: false },
      rubrics: { template: 'exhibition-5' },
    }),
  },
  {
    key: 'research-competition',
    label: 'Research Competition',
    defaultConfig: makeDefaults({
      registration: { requiresPpt: true, requiresProblemSelection: true, maxTeamSize: 4 },
      rubrics: { template: 'research-4' },
    }),
  },
  {
    key: 'paper-presentation',
    label: 'Paper Presentation',
    defaultConfig: makeDefaults({
      registration: { requiresPpt: true, maxTeamSize: 3 },
      rubrics: { template: 'paper-3' },
    }),
  },
  {
    key: 'business-case',
    label: 'Business Case Competition',
    defaultConfig: makeDefaults({
      registration: {
        requiresPpt: true,
        requiresProblemSelection: true,
        minTeamSize: 2,
        maxTeamSize: 5,
        allowSolo: false,
      },
      rubrics: { template: 'case-4' },
    }),
  },
  {
    key: 'workshop',
    label: 'Workshop',
    defaultConfig: makeDefaults({
      registration: { maxTeamSize: 2 },
      submission: { allowUrl: false, allowFile: false },
      rubrics: { template: 'none' },
      ticketing: { enabled: true },
    }),
  },
  {
    key: 'bootcamp',
    label: 'Bootcamp',
    defaultConfig: makeDefaults({
      registration: { maxTeamSize: 2 },
      submission: { allowUrl: false, allowFile: false },
      rubrics: { template: 'none' },
      ticketing: { enabled: true },
    }),
  },
  {
    key: 'innovation-day',
    label: 'Innovation Day',
    defaultConfig: makeDefaults({
      registration: { requiresPpt: true, maxTeamSize: 5 },
      rubrics: { template: 'exhibition-5' },
    }),
  },
];

// ── Default configuration ----------------------------------------

export const DEFAULT_CONFIG: PlatformConfig = {
  identity: {
    platformName: 'Innovation & Competitions',
    heroBanner: null,
    featuredEvents: [],
  },
  taxonomy: {
    eventTypes: EVENT_TYPES,
    departments: [],
    tags: [],
  },
  rubrics: {
    templates: RUBRIC_TEMPLATES,
  },
  flags: {
    certificates: true,
    tickets: true,
    externalRepo: true,
    learningHub: true,
  },
};

// ── Merge + cache ----------------------------------------

const CACHE_TTL_MS = 60_000;

let cache: { data: PlatformConfig; expiresAt: number } | null = null;

export const clearPlatformConfigCache = (): void => {
  cache = null;
};

/**
 * Set a dotted path ('identity.platformName') on a nested object.
 * Intermediate objects are created on demand.
 */
const setNested = (obj: Record<string, unknown>, path: string, value: unknown): void => {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const next = current[part];
    if (next == null || typeof next !== 'object' || Array.isArray(next)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
};

/**
 * Return the merged platform configuration: DEFAULT_CONFIG overlaid with
 * any overrides stored in `site_settings`. Results are cached for a short
 * TTL (60s); call clearPlatformConfigCache() after writing settings.
 */
export async function getPlatformConfig(): Promise<PlatformConfig> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.data;

  const rows = await prisma.siteSetting.findMany({
    select: { key: true, value: true },
  });

  const merged = structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>;
  for (const row of rows) {
    if (typeof row.key !== 'string' || row.key.length === 0) continue;
    setNested(merged, row.key, row.value);
  }

  const config = merged as unknown as PlatformConfig;
  cache = { data: config, expiresAt: now + CACHE_TTL_MS };
  return config;
}

// ── Lookups ----------------------------------------

/** Default registration/submission config for an event type, falling back to the hackathon defaults. */
export function getEventTypeDefaults(key: string): EventDefaultConfig {
  const found = EVENT_TYPES.find((t) => t.key === key);
  return found ? found.defaultConfig : EVENT_TYPES[0].defaultConfig;
}

/** Rubric template by key, or null when unknown. */
export function getRubricTemplate(key: string): RubricTemplate | null {
  return RUBRIC_TEMPLATES.find((t) => t.key === key) ?? null;
}
