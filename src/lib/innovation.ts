import type { PrismaClient } from '@prisma/client';

export const ACTIVE_CLAIM_STATUSES = ['IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED', 'SHORTLISTED'] as const;

const validTransitions: Record<string, string[]> = {
  UPCOMING: ['ACTIVE'],
  ACTIVE: ['CLOSED'],
  JUDGING: ['CLOSED'],
  CLOSED: [],
};

export const canTransitionEventStatus = (current: string, next: string) => {
  return validTransitions[current]?.includes(next) ?? false;
};

export const sanitizeFilename = (fileName: string) => {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
};

export const parseIdList = (value: string | null): number[] => {
  if (!value) return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0);
    } catch {
      return [];
    }
  }

  return trimmed
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
};

export const parseStringList = (value: string | null): string[] => {
  if (!value) return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  const toClean = (input: unknown): string[] => {
    if (!Array.isArray(input)) return [];
    return Array.from(
      new Set(
        input
          .map((item) => String(item).trim())
          .filter((item) => item.length > 0)
      )
    );
  };

  if (trimmed.startsWith('[')) {
    try {
      return toClean(JSON.parse(trimmed) as unknown);
    } catch {
      return [];
    }
  }

  return Array.from(
    new Set(
      trimmed
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
    )
  );
};

export type LeaderboardRow = {
  rank: number;
  teamName: string;
  score: number;
  claimId: number;
  updatedAt: Date;
};

export const getEventLeaderboard = async (prisma: PrismaClient, eventId: number): Promise<LeaderboardRow[]> => {
  const claims = await prisma.claim.findMany({
    where: {
      problem: { eventId },
      OR: [{ finalScore: { not: null } }, { score: { not: null } }],
    },
    select: {
      id: true,
      teamName: true,
      finalScore: true,
      score: true,
      updatedAt: true,
    },
    orderBy: [{ finalScore: 'desc' }, { score: 'desc' }, { updatedAt: 'asc' }],
  });

  return claims.map((claim, index) => ({
    rank: index + 1,
    teamName: claim.teamName || `Team-${claim.id}`,
    score: claim.finalScore ?? claim.score ?? 0,
    claimId: claim.id,
    updatedAt: claim.updatedAt,
  }));
};

export const getEventParticipantEmails = async (prisma: PrismaClient, eventId: number): Promise<string[]> => {
  const members = await prisma.claimMember.findMany({
    where: {
      claim: {
        problem: { eventId },
      },
    },
    select: {
      user: { select: { email: true } },
    },
  });

  return Array.from(new Set(members.map((m) => m.user.email)));
};
