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
    (scores.innovation * HACKATHON_RUBRIC_WEIGHTS.innovation) / 10 +
    (scores.technical * HACKATHON_RUBRIC_WEIGHTS.technical) / 10 +
    (scores.impact * HACKATHON_RUBRIC_WEIGHTS.impact) / 10 +
    (scores.ux * HACKATHON_RUBRIC_WEIGHTS.ux) / 10 +
    (scores.execution * HACKATHON_RUBRIC_WEIGHTS.execution) / 10 +
    (scores.presentation * HACKATHON_RUBRIC_WEIGHTS.presentation) / 10 +
    (scores.feasibility * HACKATHON_RUBRIC_WEIGHTS.feasibility) / 10;

  return Math.round(weighted);
};

export const isValidRubricScore = (value: number) => Number.isInteger(value) && value >= 0 && value <= 10;
