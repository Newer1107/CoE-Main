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
