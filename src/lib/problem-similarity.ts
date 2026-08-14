/**
 * Open-Innovation duplicate detection: normalize problem titles and find
 * catalogue matches so students are warned (and near-duplicates rejected)
 * before a custom problem statement is created.
 */

/** Normalize a title for comparison: lowercase, strip punctuation, collapse spaces. */
export function normalizeProblemTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Token overlap ratio between two normalized titles (0..1). */
export function titleOverlap(a: string, b: string): number {
  const ta = new Set(normalizeProblemTitle(a).split(" ").filter((t) => t.length > 2));
  const tb = new Set(normalizeProblemTitle(b).split(" ").filter((t) => t.length > 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common += 1;
  return common / Math.max(ta.size, tb.size);
}

export type SimilarProblem = { id: number; title: string; score: number };

/**
 * Find catalogue problems similar to the proposed title.
 * - exact normalized match (or one contains the other) => score 1
 * - otherwise token overlap >= 0.5 => listed as "similar"
 */
export function findSimilarProblems(problems: { id: number; title: string }[], proposed: string): SimilarProblem[] {
  const norm = normalizeProblemTitle(proposed);
  if (!norm) return [];

  const out: SimilarProblem[] = [];
  for (const p of problems) {
    const pNorm = normalizeProblemTitle(p.title);
    if (!pNorm) continue;
    let score = titleOverlap(norm, pNorm);
    if (norm === pNorm || norm.includes(pNorm) || pNorm.includes(norm)) score = 1;
    if (score >= 0.5) out.push({ id: p.id, title: p.title, score: Math.round(score * 100) });
  }
  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/** Exact/near-duplicate (>=75% overlap) — server-side hard rejection. */
export function isDuplicateProblem(problems: { id: number; title: string }[], proposed: string): SimilarProblem | null {
  const found = findSimilarProblems(problems, proposed).find((s) => s.score >= 75);
  return found ?? null;
}
