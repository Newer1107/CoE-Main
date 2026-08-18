import type { PrismaClient } from '@prisma/client';

export const ACTIVE_CLAIM_STATUSES = ['IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED', 'SHORTLISTED'] as const;

const validTransitions: Record<string, string[]> = {
  UPCOMING: ['ACTIVE'],
  ACTIVE: ['JUDGING', 'CLOSED'],
  JUDGING: ['CLOSED'],
  CLOSED: [],
};

export const canTransitionEventStatus = (current: string, next: string) => {
  return validTransitions[current]?.includes(next) ?? false;
};

export const sanitizeFilename = (fileName: string) => {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
};

export const MAX_UPLOAD_MB = 20;

const DECK_ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

const SUBMISSION_ALLOWED_TYPES = [
  'application/octet-stream',
  'application/pdf',
  'application/zip',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

// Session documents: documents + images (screenshots/photos of work).
const SESSION_DOC_ALLOWED_TYPES = [
  'application/pdf',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
];

/** Returns an error message when the upload must be rejected, else null. */
export const validateUploadFile = (
  file: File | null,
  kind: 'deck' | 'submission' | 'session-doc'
): string | null => {
  if (!file) return null;
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    return `File exceeds the ${MAX_UPLOAD_MB}MB limit`;
  }
  const allowed =
    kind === 'deck'
      ? DECK_ALLOWED_TYPES
      : kind === 'submission'
        ? SUBMISSION_ALLOWED_TYPES
        : SESSION_DOC_ALLOWED_TYPES;
  const mime = (file.type || '').toLowerCase();
  if (mime && !allowed.includes(mime)) {
    const label =
      kind === 'deck'
        ? 'PDF or PPT'
        : kind === 'submission'
          ? 'PDF, ZIP, PPT, DOC or TXT'
          : 'PDF, DOC, PPT, ZIP, images or TXT';
    return `File type not allowed (${label} only)`;
  }
  return null;
};

export const getStoredFileDisplayName = (fileKey: string | null | undefined): string | null => {
  if (!fileKey) return null;

  const lastSegment = fileKey.split('/').pop();
  if (!lastSegment) return null;

  // Stored keys usually look like: resume-<timestamp>-<original_file_name>
  const withNoPrefix = lastSegment.replace(/^resume-\d+-/, '');
  return decodeURIComponent(withNoPrefix);
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
  problemTitle: string;
  score: number;
  claimId: number;
  updatedAt: Date;
};

export const getEventLeaderboard = async (prisma: PrismaClient, eventId: number): Promise<LeaderboardRow[]> => {
  const claims = await prisma.claim.findMany({
    where: {
      problem: { eventId },
      OR: [{ finalScore: { not: null } }, { score: { not: null } }, { rubricScores: { some: {} } }],
    },
    select: {
      id: true,
      teamName: true,
      problem: {
        select: {
          title: true,
        },
      },
      finalScore: true,
      score: true,
      updatedAt: true,
      rubricScores: { select: { round: true, score: true } },
    },
  });

  return claims
    .map((claim) => {
      // Live rubric total = sum of the LAST judging round (rounds are audit layers,
      // never summed together).
      let rubricTotal: number | null = null;
      if (claim.rubricScores.length > 0) {
        const byRound = new Map<number, number>();
        for (const s of claim.rubricScores) {
          byRound.set(s.round, (byRound.get(s.round) ?? 0) + s.score);
        }
        rubricTotal = byRound.get(Math.max(...byRound.keys())) ?? 0;
      }
      return {
        claim,
        score: claim.finalScore ?? claim.score ?? rubricTotal ?? 0,
      };
    })
    .sort((a, b) => b.score - a.score || a.claim.updatedAt.getTime() - b.claim.updatedAt.getTime())
    .map(({ claim, score }, index) => ({
      rank: index + 1,
      teamName: claim.teamName || `Team-${claim.id}`,
      problemTitle: claim.problem.title,
      score,
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
