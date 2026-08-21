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
  round1DeclaredByDept?: Record<string, boolean>; // Phase 1 declared per dept (COMP, CSE...)
  r2ByDept?: Record<string, { status?: string; startAt?: string; endAt?: string; declaredAt?: string }>; // Phase 2 state per dept
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

// ── Department helpers (UID-derived) ─────────────────────────────────────

const DEPT_FROM_BRANCH: Record<string, string> = {
  // longest prefixes first (checked in insertion order) — prevents stale shadowing
  CSECSA: 'CSE', CSECSB: 'CSE', CSECSC: 'CSE', CSECS: 'CSE', CSEIOT: 'CSE', CSEA: 'CSE', CSEB: 'CSE', CSEC: 'CSE',
  COMP: 'COMP', IT: 'IT', CSE: 'CSE',
  AIML: 'AIML', AIDS: 'AIDS', ECSA: 'ECSA', ECS: 'ECS',
  EXTC: 'ENTC', ENTC: 'ENTC', EXT: 'ENTC', MME: 'MME', MECH: 'MECH',
  CIVIL: 'CIVIL', BVSDE: 'BVOC', BVSDS: 'BVOC', BVOC: 'BVOC', MCA: 'MCA',
  BCA: 'BCA', IOT: 'IOT',
};

export function deptFromUid(uid: string | null | undefined): string | null {
  if (!uid) return null;
  const m = uid.trim().toUpperCase().match(/^(\d{2})-([A-Z&]+)/);
  if (!m) return null;
  let raw = m[2];
  // strip '&' so AI&ML -> AIML
  raw = raw.replace(/&/g, '');
  for (const [k, code] of Object.entries(DEPT_FROM_BRANCH)) {
    if (raw.startsWith(k)) return code;
  }
  return raw; // fallback: raw branch string
}

export const DEPARTMENT_CODES = ['COMP','IT','CSE','AIML','AIDS','ECSA','ENTC','MME','MECH','CIVIL','BVOC','MCA','BCA','IOT'] as const;
export type DepartmentCode = typeof DEPARTMENT_CODES[number];

/** Normalize a coordinator's departmentCode from DB (null/empty = global = all depts). */
export function normalizeDeptCode(v: string | null | undefined): string | null {
  if (!v) return null;
  const up = v.trim().toUpperCase();
  if (!up) return null;
  if (up === 'EXTC' || up === 'EXT') return 'ENTC';
  // also handle any stray CSE variant codes passed explicitly
  if (up.startsWith('CSE')) return 'CSE';
  return up.replace(/&/g, '');
}

/**
 * Event manager = global ADMIN or the event's assigned coordinator (a teacher).
 * Now with department scoping:
 * - ADMIN: always true
 * - legacy coordinatorId column: always true (global, backward-compat)
 * - EventCoordinator rows: null departmentCode = global; otherwise dept-scoped.
 * - For non-ADMIN, pass the coordinatorRows fetched with departmentCode.
 */
export function canManageEvent(
  user: { id: number; role: string },
  event: { coordinatorId: number | null; coordinators?: { userId: number; departmentCode?: string | null }[] },
): boolean {
  if (user.role === 'ADMIN') return true;
  if (event.coordinatorId === user.id) return true; // legacy single-coordinator path
  return !!event.coordinators?.some((c) => c.userId === user.id);
}

/** For a dept-scoped coordinator, which department codes they are allowed to manage (null = global). */
export function coordinatorDepartments(
  userId: number,
  event: { coordinatorId: number | null; coordinators?: { userId: number; departmentCode?: string | null }[] },
): string[] | null {
  // ADMIN or legacy global
  if (event.coordinatorId === userId) return null;
  const rows = (event.coordinators ?? []).filter((c) => c.userId === userId);
  if (rows.length === 0) return null; // not a coordinator — caller should have already denied
  if (rows.some((r) => !r.departmentCode)) return null; // at least one global row
  return rows.map((r) => normalizeDeptCode(r.departmentCode as string)).filter(Boolean) as string[];
}

/** Whether a claim (via its lead UID) belongs to one of the coordinator's departments. */
export function claimDeptAllowed(leadUid: string | null | undefined, allowedDepts: string[] | null): boolean {
  if (allowedDepts === null) return true;
  const dept = deptFromUid(leadUid);
  if (!dept) return false;
  return allowedDepts.includes(dept);
}

/** Prisma where fragment for claims that belong to allowed departments (via lead member's UID). */
export function deptClaimWhere(allowedDepts: string[] | null): Record<string, unknown> | null {
  if (allowedDepts === null) return null;
  // We can't filter UID pattern directly in Prisma cleanly, so we return null and
  // let the caller do post-filtering. The helpers above are for that.
  // Keeping this as a typed sentinel: callers check null = no filter needed.
  return { __deptFilter: allowedDepts } as unknown as Record<string, unknown>;
}
