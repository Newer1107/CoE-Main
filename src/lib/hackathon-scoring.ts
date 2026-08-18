import type { Prisma } from '@prisma/client';

export type HackathonRubricScores = {
  innovation: number;
  technical: number;
  impact: number;
  ux: number;
  execution: number;
  presentation: number;
  feasibility: number;
};

export const HACKATHON_RUBRIC_ORDER: Array<keyof HackathonRubricScores> = [
  'innovation',
  'technical',
  'impact',
  'ux',
  'execution',
  'presentation',
  'feasibility',
];

export const HACKATHON_RUBRIC_LABELS: Record<keyof HackathonRubricScores, string> = {
  innovation: 'Innovation & Creativity',
  technical: 'Technical Implementation',
  impact: 'Problem Relevance & Impact',
  ux: 'User Experience & Design',
  execution: 'Execution & Completeness',
  presentation: 'Presentation & Communication',
  feasibility: 'Feasibility & Future Scope',
};

export const HACKATHON_RUBRIC_WEIGHTS: Record<keyof HackathonRubricScores, number> = {
  innovation: 15,
  technical: 20,
  impact: 15,
  ux: 10,
  execution: 20,
  presentation: 10,
  feasibility: 10,
};

export const calculateWeightedHackathonScore = (scores: HackathonRubricScores): number => {
  const weighted =
    scores.innovation +
    scores.technical +
    scores.impact +
    scores.ux +
    scores.execution +
    scores.presentation +
    scores.feasibility;

  return Math.round(weighted);
};

export const isValidRubricScore = (
  key: keyof HackathonRubricScores,
  value: number,
) => Number.isInteger(value) && value >= 0 && value <= HACKATHON_RUBRIC_WEIGHTS[key];

// ─── Config-driven rubric categories ───

export type RubricCategoryConfig = {
  id?: number;
  key: string;
  label: string;
  weight: number;
};

/** The default 7 rubric categories, mirroring the legacy fixed columns. */
export const LEGACY_CATEGORIES: RubricCategoryConfig[] = HACKATHON_RUBRIC_ORDER.map((key) => ({
  key,
  label: HACKATHON_RUBRIC_LABELS[key],
  weight: HACKATHON_RUBRIC_WEIGHTS[key],
}));

/**
 * Loads the event-defined rubric categories ordered by `order`.
 * Returns null when the event has no RubricCategory rows (callers then fall back to LEGACY_CATEGORIES).
 */
export const resolveRubricCategories = async (
  db: { rubricCategory: Prisma.RubricCategoryDelegate },
  eventId: number,
): Promise<RubricCategoryConfig[] | null> => {
  const rows = await db.rubricCategory.findMany({
    where: { eventId },
    orderBy: [{ parentCategoryId: 'asc' }, { order: 'asc' }],
    select: { id: true, key: true, label: true, weight: true },
  });

  return rows.length > 0 ? rows : null;
};

/**
 * Sums the submitted rubric values, capping each value at [0, category.weight],
 * then rounds to the nearest integer.
 */
export const calculateScoreFromRubrics = (
  values: Record<string, number>,
  categories: { key: string; label: string; weight: number }[],
): number => {
  const total = categories.reduce((sum, category) => {
    const raw = values[category.key];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return sum;
    return sum + Math.min(Math.max(raw, 0), category.weight);
  }, 0);

  return Math.round(total);
};

/**
 * Validates submitted rubric values against the category definitions.
 * Returns a list of error messages, or null when the values are valid.
 */
export const validateRubricValues = (
  values: Record<string, number>,
  categories: { key: string; label: string; weight: number }[],
): string[] | null => {
  const errors: string[] = [];
  const validKeys = new Set(categories.map((category) => category.key));

  for (const key of Object.keys(values)) {
    if (!validKeys.has(key)) {
      errors.push(`Unknown rubric key: ${key}`);
    }
  }

  for (const category of categories) {
    const value = values[category.key];
    if (typeof value !== 'number') {
      errors.push(`Missing rubric score for ${category.key}`);
    } else if (!Number.isInteger(value)) {
      errors.push(`Rubric score for ${category.key} must be an integer`);
    } else if (value < 0 || value > category.weight) {
      errors.push(`Rubric score for ${category.key} must be between 0 and ${category.weight}`);
    }
  }

  return errors.length > 0 ? errors : null;
};
