/**
 * Shared helpers for the hackathon ops module (venues, judges, notices,
 * scores, feedback, media) and the judge portal.
 */
import prisma from '@/lib/prisma';
import type { HackathonEvent } from '@prisma/client';

export type OpsConfig = {
  venues?: boolean;
  judges?: boolean;
  notices?: boolean;
  scoreReview?: boolean;
  judgeRounds?: number; // 0 = single round (default)
  commentsToStudents?: boolean;
  feedback?: boolean;
  mediaReport?: boolean;
  currentRound?: number; // live judging round (advanced by coordinator)
};

export function opsConfig(event: Pick<HackathonEvent, 'config'>): OpsConfig {
  const cfg = (event.config ?? {}) as { ops?: OpsConfig };
  return cfg.ops ?? {};
}

export function currentRound(event: Pick<HackathonEvent, 'config'>): number {
  const cfg = opsConfig(event);
  const max = Math.max(1, cfg.judgeRounds ?? 1);
  const cur = cfg.currentRound ?? 1;
  return Math.min(Math.max(cur, 1), max);
}

/** The judge's effective claim scope for an event: their venue, or ALL claims when venueId is null. */
export function judgeVenueId(assignment: { venueId: number | null }): number | null {
  return assignment.venueId ?? null;
}

/** Resolve the judge's assignment for an event (null when not assigned). */
export async function findJudgeAssignment(judgeId: number, eventId: number) {
  return prisma.judgeAssignment.findUnique({
    where: { eventId_judgeId: { eventId, judgeId } },
  });
}

/** Whether a judge may score the given claim for an event (venue scope). */
export function canJudgeClaim(assignment: { venueId: number | null }, claimVenueId: number | null): boolean {
  return assignment.venueId === null || assignment.venueId === claimVenueId;
}

/**
 * Event manager = global ADMIN or the event's assigned coordinator (a teacher).
 * This is the single gate for all coordinator-panel routes.
 */
export function canManageEvent(
  user: { id: number; role: string },
  event: { coordinatorId: number | null; coordinators?: { userId: number }[] },
): boolean {
  if (user.role === 'ADMIN') return true;
  if (event.coordinatorId === user.id) return true; // legacy single-coordinator path
  return !!event.coordinators?.some((c) => c.userId === user.id);
}
