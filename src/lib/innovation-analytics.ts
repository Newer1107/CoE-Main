import type { ClaimStatus, Prisma } from '@prisma/client';

export const ANALYTICS_CLAIM_STATUSES: ClaimStatus[] = [
  'IN_PROGRESS',
  'SUBMITTED',
  'SHORTLISTED',
  'ACCEPTED',
  'REVISION_REQUESTED',
  'REJECTED',
];

export type InnovationAnalyticsStage = 'SCREENING' | 'JUDGING' | 'CLOSED';

export const STAGE_TO_CLAIM_STATUSES: Record<InnovationAnalyticsStage, ClaimStatus[]> = {
  SCREENING: ['IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED'],
  JUDGING: ['SHORTLISTED'],
  CLOSED: ['ACCEPTED', 'REJECTED'],
};

export type InnovationAnalyticsFilters = {
  eventId?: number;
  problemId?: number;
  teamId?: number;
  team?: string;
  status?: ClaimStatus;
  stage?: InnovationAnalyticsStage;
  search?: string;
  startDate?: Date;
  endDate?: Date;
  page: number;
  pageSize: number;
};

type QuerySource = {
  get(name: string): string | null;
};

const parsePositiveInt = (raw: string | null): number | undefined => {
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return undefined;
  return value;
};

const parseDateLike = (raw: string | null): Date | undefined => {
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
};

const normalizeEndOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const parseStatus = (raw: string | null): ClaimStatus | undefined => {
  if (!raw) return undefined;
  const value = raw.trim().toUpperCase() as ClaimStatus;
  if (!ANALYTICS_CLAIM_STATUSES.includes(value)) return undefined;
  return value;
};

const parseStage = (raw: string | null): InnovationAnalyticsStage | undefined => {
  if (!raw) return undefined;
  const value = raw.trim().toUpperCase() as InnovationAnalyticsStage;
  if (!Object.keys(STAGE_TO_CLAIM_STATUSES).includes(value)) return undefined;
  return value;
};

const parsePage = (raw: string | null) => {
  const parsed = Number(raw || '1');
  if (!Number.isInteger(parsed) || parsed <= 0) return 1;
  return parsed;
};

const parsePageSize = (raw: string | null, maxPageSize: number, defaultPageSize: number) => {
  const parsed = Number(raw || String(defaultPageSize));
  if (!Number.isInteger(parsed) || parsed <= 0) return defaultPageSize;
  return Math.min(maxPageSize, parsed);
};

export const parseInnovationAnalyticsFilters = (
  searchParams: QuerySource,
  options?: { defaultPageSize?: number; maxPageSize?: number }
): { filters: InnovationAnalyticsFilters; errors: string[] } => {
  const errors: string[] = [];
  const defaultPageSize = options?.defaultPageSize ?? 20;
  const maxPageSize = options?.maxPageSize ?? 100;

  const eventIdRaw = searchParams.get('eventId');
  const problemIdRaw = searchParams.get('problemId');
  const teamIdRaw = searchParams.get('teamId');
  const statusRaw = searchParams.get('status');
  const stageRaw = searchParams.get('stage');
  const startDateRaw = searchParams.get('startDate');
  const endDateRaw = searchParams.get('endDate');

  const eventId = parsePositiveInt(eventIdRaw);
  if (eventIdRaw && !eventId) errors.push('eventId must be a positive integer.');

  const problemId = parsePositiveInt(problemIdRaw);
  if (problemIdRaw && !problemId) errors.push('problemId must be a positive integer.');

  const teamId = parsePositiveInt(teamIdRaw);
  if (teamIdRaw && !teamId) errors.push('teamId must be a positive integer.');

  const status = parseStatus(statusRaw);
  if (statusRaw && !status) {
    errors.push(`status must be one of: ${ANALYTICS_CLAIM_STATUSES.join(', ')}`);
  }

  const stage = parseStage(stageRaw);
  if (stageRaw && !stage) {
    errors.push('stage must be one of: SCREENING, JUDGING, CLOSED.');
  }

  const startDate = parseDateLike(startDateRaw);
  if (startDateRaw && !startDate) {
    errors.push('startDate must be a valid date/time value.');
  }

  const parsedEndDate = parseDateLike(endDateRaw);
  if (endDateRaw && !parsedEndDate) {
    errors.push('endDate must be a valid date/time value.');
  }

  const endDate = parsedEndDate
    ? endDateRaw && endDateRaw.length <= 10
      ? normalizeEndOfDay(parsedEndDate)
      : parsedEndDate
    : undefined;

  if (startDate && endDate && endDate < startDate) {
    errors.push('endDate must be greater than or equal to startDate.');
  }

  const search = (searchParams.get('search') || '').trim();
  const team = (searchParams.get('team') || '').trim();

  return {
    filters: {
      eventId,
      problemId,
      teamId,
      team: team.length > 0 ? team : undefined,
      status,
      stage,
      search: search.length > 0 ? search : undefined,
      startDate,
      endDate,
      page: parsePage(searchParams.get('page')),
      pageSize: parsePageSize(searchParams.get('pageSize'), maxPageSize, defaultPageSize),
    },
    errors,
  };
};

export const buildInnovationAnalyticsClaimWhere = (filters: InnovationAnalyticsFilters): Prisma.ClaimWhereInput => {
  const problemWhere: Prisma.ProblemWhereInput = {
    eventId: { not: null },
  };

  if (typeof filters.eventId === 'number') {
    problemWhere.eventId = filters.eventId;
  }

  if (typeof filters.problemId === 'number') {
    problemWhere.id = filters.problemId;
  }

  const where: Prisma.ClaimWhereInput = {
    problem: problemWhere,
  };

  if (typeof filters.teamId === 'number') {
    where.id = filters.teamId;
  }

  if (filters.team) {
    where.teamName = {
      contains: filters.team,
    };
  }

  if (filters.stage) {
    where.status = {
      in: STAGE_TO_CLAIM_STATUSES[filters.stage],
    };
  }

  if (filters.status) {
    if (filters.stage) {
      const allowed = STAGE_TO_CLAIM_STATUSES[filters.stage];
      if (!allowed.includes(filters.status)) {
        where.id = -1;
      } else {
        where.status = filters.status;
      }
    } else {
      where.status = filters.status;
    }
  }

  if (filters.startDate || filters.endDate) {
    where.updatedAt = {
      ...(filters.startDate ? { gte: filters.startDate } : {}),
      ...(filters.endDate ? { lte: filters.endDate } : {}),
    };
  }

  return where;
};

export const getPagination = (filters: InnovationAnalyticsFilters) => {
  return {
    page: filters.page,
    pageSize: filters.pageSize,
    skip: (filters.page - 1) * filters.pageSize,
    take: filters.pageSize,
  };
};

export const mapClaimStatusToStage = (status: ClaimStatus): InnovationAnalyticsStage => {
  if (STAGE_TO_CLAIM_STATUSES.JUDGING.includes(status)) return 'JUDGING';
  if (STAGE_TO_CLAIM_STATUSES.CLOSED.includes(status)) return 'CLOSED';
  return 'SCREENING';
};

export const deriveClaimScore = (row: { finalScore: number | null; score: number | null }) => {
  return row.finalScore ?? row.score;
};

export const computeWeightedAverageScore = (rows: Array<{ finalScore: number | null; score: number | null }>) => {
  const scored = rows
    .map((row) => deriveClaimScore(row))
    .filter((value): value is number => typeof value === 'number');

  if (scored.length === 0) return null;
  const total = scored.reduce((sum, value) => sum + value, 0);
  return Number((total / scored.length).toFixed(2));
};
