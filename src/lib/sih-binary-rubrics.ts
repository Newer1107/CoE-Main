// ── SIH binary rubric auto-seed (live events) ───────────────────────────────────
// When a live ACTIVE/JUDGING/CLOSED event still has the old 4/7 flat rubrics,
// replace them with the 30-row binary set (5 params + 25 questions). Dev already
// has the seed, so this is a no-op there (detects p1_1 key).
export const SIH_PARAMS: { key: string; label: string; weight: number; order: number; questions: { key: string; label: string; critical: boolean }[] }[] = [
  { key: 'p1', label: 'Problem Understanding & Impact', weight: 20, order: 1, questions: [
    { key: 'p1_1', label: 'Problem Definition — Is the problem clearly defined and genuinely significant?', critical: true },
    { key: 'p1_2', label: 'User Need — Are the target users/beneficiaries and their actual need clearly demonstrated?', critical: true },
    { key: 'p1_3', label: 'Evidence — Is the scale or severity supported by credible evidence?', critical: false },
    { key: 'p1_4', label: 'Problem–Solution Fit — Does the solution address the core problem rather than merely a symptom?', critical: true },
    { key: 'p1_5', label: 'Impact — Is the expected real-world impact measurable and meaningful?', critical: false },
  ]},
  { key: 'p2', label: 'Innovation & Differentiation', weight: 20, order: 2, questions: [
    { key: 'p2_1', label: 'Existing Landscape — Have relevant existing solutions or alternatives been identified?', critical: true },
    { key: 'p2_2', label: 'Market Gap — Is a genuine gap demonstrated?', critical: true },
    { key: 'p2_3', label: 'USP — Is the solution genuinely differentiated with a clear USP?', critical: true },
    { key: 'p2_4', label: 'Innovation — Meaningful improvement rather than superficial change?', critical: false },
    { key: 'p2_5', label: 'Competitive Advantage — Credible defensible edge?', critical: false },
  ]},
  { key: 'p3', label: 'Technical Excellence', weight: 25, order: 3, questions: [
    { key: 'p3_1', label: 'Architecture — Technically sound and appropriate?', critical: true },
    { key: 'p3_2', label: 'Technology Choice — Core tech/algorithms/data justified?', critical: true },
    { key: 'p3_3', label: 'Technical Depth — Meaningful engineering complexity demonstrated?', critical: true },
    { key: 'p3_4', label: 'Robustness — Reliability, performance, security, failure modes considered?', critical: false },
    { key: 'p3_5', label: 'Technology Advantage — Does tech provide meaningful advantage?', critical: false },
  ]},
  { key: 'p4', label: 'Validation, Feasibility & Scalability', weight: 20, order: 4, questions: [
    { key: 'p4_1', label: 'Working Solution — Working prototype or credible demo?', critical: true },
    { key: 'p4_2', label: 'Validation — Validated with real or representative users/evidence?', critical: false },
    { key: 'p4_3', label: 'Evidence of Results — Claims supported by measurable evidence?', critical: true },
    { key: 'p4_4', label: 'Feasibility — Technically and economically feasible for deployment?', critical: false },
    { key: 'p4_5', label: 'Scale — Credible path to scalability and productization?', critical: false },
  ]},
  { key: 'p5', label: 'Solution Quality, UX & Presentation', weight: 15, order: 5, questions: [
    { key: 'p5_1', label: 'User Experience — Core journey usable and understandable?', critical: false },
    { key: 'p5_2', label: 'Product Value — Prototype demonstrates core value effectively?', critical: true },
    { key: 'p5_3', label: 'Demonstration — Convincing evidence rather than merely showing features?', critical: true },
    { key: 'p5_4', label: 'Communication — Problem → solution → tech → impact story clear?', critical: true },
    { key: 'p5_5', label: 'Team Defence — Can the team defend and answer with evidence?', critical: false },
  ]},
];

export async function ensureSihBinaryRubrics(prisma: any, eventId: number): Promise<void> {
  const existing = await prisma.rubricCategory.findMany({ where: { eventId }, select: { key: true } });
  if (existing.some((r: { key: string }) => r.key.startsWith('p1_'))) return; // already binary
  // Legacy flat schools have keys like innovation/p1/problem_understanding — don't auto-convert unless live
  const event = await prisma.hackathonEvent.findUnique({ where: { id: eventId }, select: { status: true } });
  if (!event || !['ACTIVE', 'JUDGING', 'CLOSED'].includes(event.status)) return;
  // Replace legacy rows (score cap checks rely on binary weights, so legacy caps are wrong — swap them)
  await prisma.rubricCategory.deleteMany({ where: { eventId } });
  for (const param of SIH_PARAMS) {
    const parent = await prisma.rubricCategory.create({ data: { eventId, key: param.key, label: param.label, weight: param.weight, order: param.order, isCritical: false } });
    for (let i = 0; i < param.questions.length; i++) {
      const q = param.questions[i];
      await prisma.rubricCategory.create({ data: { eventId, key: q.key, label: q.label, weight: 1, order: i + 1, isCritical: q.critical, parentCategoryId: parent.id } });
    }
  }
}
