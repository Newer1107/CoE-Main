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

export const getEventLeaderboard = async (prisma: PrismaClient, eventId: number, dept: string | null = null, phase: number = 0): Promise<LeaderboardRow[]> => {
  // ponytail: one DB roundtrip for all rubric data; in-memory weighted avg per claim (N*J*5 trivial)
  const categories = await prisma.rubricCategory.findMany({
    where: { eventId },
    select: { id: true, weight: true, parentCategoryId: true },
  });
  const isBinary = categories.some((c: { parentCategoryId: number | null }) => c.parentCategoryId !== null);
  const parents = categories.filter((c: { parentCategoryId: number | null }) => c.parentCategoryId === null);
  const parentMap = new Map<number, number>(parents.map((p: { id: number; weight: number }) => [p.id, p.weight]));
  const childToParent = new Map<number, number>();
  for (const c of categories as { id: number; parentCategoryId: number | null }[]) {
    if (c.parentCategoryId !== null) childToParent.set(c.id, c.parentCategoryId);
  }

  const claimsRaw = await prisma.claim.findMany({
    where: {
      problem: { eventId },
      OR: [{ finalScore: { not: null } }, { score: { not: null } }, { rubricScores: { some: {} } }],
    },
    select: {
      id: true,
      teamName: true,
      problem: { select: { title: true } },
      finalScore: true,
      score: true,
      updatedAt: true,
      rubricScores: { select: { round: true, score: true, rubricCategoryId: true, judgeId: true } },
      members: { include: { user: { select: { uid: true } } } },
    },
  });

// ponytail: dept normalization mirrors hackathon-ops.normalizeDeptCode — longest CSE prefixes first
const _DEPT_MAP: Record<string, string> = {
  CSECSA: 'CSE', CSECSB: 'CSE', CSECSC: 'CSE', CSECS: 'CSE', CSEIOT: 'CSE', CSEA: 'CSE', CSEB: 'CSE', CSEC: 'CSE',
  COMP: 'COMP', IT: 'IT', CSE: 'CSE', AIML: 'AIML', AIDS: 'AIDS', ECSA: 'ECSA', ECS: 'ECS',
  EXTC: 'ENTC', ENTC: 'ENTC', EXT: 'ENTC', MME: 'MME', MECH: 'MECH', CIVIL: 'CIVIL', BVOC: 'BVOC', MCA: 'MCA', BCA: 'BCA', IOT: 'IOT',
};
function _normDept(uid: string | null | undefined): string {
  if (!uid) return '';
  const m = uid.trim().toUpperCase().replace(/&/g, '').match(/^(\d{2})-([A-Z]+)/);
  if (!m) return uid.trim().toUpperCase().replace(/&/g, '');
  let raw = m[2];
  for (const [k, code] of Object.entries(_DEPT_MAP)) if (raw.startsWith(k)) return code;
  return raw;
}

  const claims = dept ? claimsRaw.filter((c: { members: { role: string; user: { uid: string | null } }[] }) => {
    const lead = (c.members as { role: string; user: { uid: string | null } }[]).find((m) => m.role === 'LEAD');
    return _normDept(lead?.user.uid) === dept.toUpperCase();
  }) : claimsRaw;

  return claims
    .map((claim) => {
      if (claim.finalScore !== null) return { claim, score: claim.finalScore };
      if (claim.rubricScores.length === 0) return { claim, score: claim.score ?? 0 };
      // Binary weighted: average YES rate per parent across judges, weighted by parent
      const lastRound = Math.max(...(claim.rubricScores as { round: number }[]).map((s) => s.round));
      const targetRound = phase > 0 ? phase : lastRound;
      const lastRoundScores = (claim.rubricScores as { round: number; score: number; rubricCategoryId: number; judgeId: number }[]).filter((s) => s.round === targetRound);
      if (!isBinary) {
        const byRound = new Map<number, number>();
        for (const s of lastRoundScores) byRound.set(s.round, (byRound.get(s.round) ?? 0) + s.score);
        const rubricTotal = byRound.get(lastRound) ?? 0;
        return { claim, score: claim.score ?? rubricTotal };
      }
      const judgeIds = new Set(lastRoundScores.map((s) => s.judgeId ?? 0));
      let finalScore = 0;
      for (const [parentId, weight] of parentMap) {
        let sumYesRate = 0;
        let scoredJudges = 0;
        for (const jid of judgeIds) {
          const rows = lastRoundScores.filter((s) => (s.judgeId ?? 0) === jid && childToParent.get(s.rubricCategoryId) === parentId);
          if (rows.length === 0) continue;
          const yes = rows.filter((r) => r.score > 0).length;
          sumYesRate += yes / 5;
          scoredJudges++;
        }
        const avgYesRate = scoredJudges === 0 ? 0 : sumYesRate / scoredJudges;
        finalScore += avgYesRate * weight;
      }
      return { claim, score: Math.round(finalScore) };
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
