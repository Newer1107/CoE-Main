'use client';

import IndustryInternshipClient from '@/app/industry-internship/[id]/IndustryInternshipClient';

export default function FacultyInternshipClient({ problemId }: { problemId: number }) {
  return (
    <IndustryInternshipClient
      problemId={problemId}
      participantLabel="Faculty"
      allowManualAdd={false}
      workspaceLabel="Faculty Internship Workspace"
      workspaceDescription="Manage tasks, conversations, meetings, and shared documents for this faculty internship cohort."
    />
  );
}
