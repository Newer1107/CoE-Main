"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  calculateWeightedHackathonScore,
  HACKATHON_RUBRIC_LABELS,
  HACKATHON_RUBRIC_ORDER,
  HACKATHON_RUBRIC_WEIGHTS,
  HackathonRubricScores,
} from '@/lib/hackathon-scoring';

type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
};

type ProblemRow = {
  id: number;
  title: string;
  description: string;
  tags: string | null;
  mode: 'OPEN' | 'CLOSED';
  status: 'UNCLAIMED' | 'CLAIMED' | 'SOLVED' | 'ARCHIVED';
  createdById: number;
  event?: { id: number; title: string; status: 'UPCOMING' | 'ACTIVE' | 'JUDGING' | 'CLOSED' } | null;
  _count: { claims: number };
};

type SubmissionRow = {
  id: number;
  teamName: string | null;
  status: string;
  isAbsent: boolean;
  score: number | null;
  finalScore: number | null;
  innovationScore: number | null;
  technicalScore: number | null;
  impactScore: number | null;
  uxScore: number | null;
  executionScore: number | null;
  presentationScore: number | null;
  feasibilityScore: number | null;
  feedback: string | null;
  badges: string | null;
  submissionUrl: string | null;
  submissionFileUrl: string | null;
  updatedAt: string;
  problem: { id: number; title: string; createdById: number; event: { id: number; title: string } | null };
  members: { user: { id: number; name: string; email: string; uid: string | null }; role: string }[];
};

type EventRow = {
  id: number;
  title: string;
  description: string | null;
  status: 'UPCOMING' | 'ACTIVE' | 'JUDGING' | 'CLOSED';
  registrationOpen: boolean;
  startTime: string;
  endTime: string;
  createdById: number;
  _count: { problems: number };
};

type InnovationFacultyClientProps = {
  role: 'FACULTY' | 'ADMIN';
  userId: number;
};

type ScreeningDecisionStatus = 'SHORTLISTED' | 'REJECTED';
type JudgingDecisionStatus = 'ACCEPTED' | 'REJECTED';
type StagedDecisionStatus = ScreeningDecisionStatus | JudgingDecisionStatus;

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options?.headers ?? {}),
    },
  });

  const payload = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || !payload.success) throw new Error(payload.message || 'Request failed');
  return payload.data;
}

export default function InnovationFacultyClient({ role, userId }: InnovationFacultyClientProps) {
  const [activeTab, setActiveTab] = useState<'problems' | 'submissions' | 'events'>('problems');
  const [eventsSubTab, setEventsSubTab] = useState<'create' | 'manage' | 'teams'>('create');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [problems, setProblems] = useState<ProblemRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);

  const [newProblemTitle, setNewProblemTitle] = useState('');
  const [newProblemDescription, setNewProblemDescription] = useState('');
  const [newProblemTags, setNewProblemTags] = useState('');

  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventStartTime, setEventStartTime] = useState('');
  const [eventEndTime, setEventEndTime] = useState('');
  const [eventProblems, setEventProblems] = useState<Array<{ title: string; description: string }>>([
    { title: '', description: '' },
  ]);
  const [eventPpt, setEventPpt] = useState<File | null>(null);
  const [eventProblemForms, setEventProblemForms] = useState<Record<number, { title: string; description: string }>>({});
  const [eventNewProblemForms, setEventNewProblemForms] = useState<Record<number, { title: string; description: string }>>({});
  const [selectedRegistrationEventId, setSelectedRegistrationEventId] = useState<number | null>(null);
  const [selectedRegistrationProblemId, setSelectedRegistrationProblemId] = useState<number | 'ALL'>('ALL');
  const [selectedSubmissionEventId, setSelectedSubmissionEventId] = useState<number | null>(null);
  const [reviewForms, setReviewForms] = useState<Record<number, { status: 'ACCEPTED' | 'REVISION_REQUESTED' | 'REJECTED'; score: string; feedback: string; badges: string }>>({});
  const [stagedDecisions, setStagedDecisions] = useState<Record<number, StagedDecisionStatus>>({});
  const [stagedRubrics, setStagedRubrics] = useState<Record<number, HackathonRubricScores>>({});

  const loadAll = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [openProblemData, hackathonProblemData, submissionData, eventData] = await Promise.all([
        fetchJson<ProblemRow[]>('/api/innovation/problems?track=open'),
        fetchJson<ProblemRow[]>('/api/innovation/problems?track=hackathon'),
        fetchJson<SubmissionRow[]>('/api/innovation/faculty/submissions'),
        fetchJson<EventRow[]>('/api/innovation/events'),
      ]);

      setProblems([...openProblemData, ...hackathonProblemData]);
      setSubmissions(submissionData);
      setEvents(eventData);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load innovation data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const ownProblems = useMemo(() => problems.filter((problem) => problem.createdById === userId && !problem.event?.id), [problems, userId]);
  const manageableEvents = useMemo(() => (role === 'ADMIN' ? events : events.filter((event) => event.createdById === userId)), [events, role, userId]);
  const problemsByEvent = useMemo(() => {
    return problems.reduce<Record<number, ProblemRow[]>>((acc, problem) => {
      if (!problem.event?.id) return acc;
      if (!acc[problem.event.id]) acc[problem.event.id] = [];
      acc[problem.event.id].push(problem);
      return acc;
    }, {});
  }, [problems]);
  const registrationsByEvent = useMemo(() => {
    return submissions.reduce<Record<number, SubmissionRow[]>>((acc, submission) => {
      const eventId = submission.problem.event?.id;
      if (!eventId) return acc;
      if (!acc[eventId]) acc[eventId] = [];
      acc[eventId].push(submission);
      return acc;
    }, {});
  }, [submissions]);
  const hackathonReviewEvents = useMemo(() => {
    const map = new Map<number, { id: number; title: string }>();
    submissions.forEach((submission) => {
      if (!submission.problem.event) return;
      if (!['IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED', 'SHORTLISTED'].includes(submission.status)) return;
      map.set(submission.problem.event.id, {
        id: submission.problem.event.id,
        title: submission.problem.event.title,
      });
    });
    return Array.from(map.values());
  }, [submissions]);

  const screeningHackathonSubmissions = useMemo(
    () =>
      submissions.filter(
        (submission) =>
          submission.problem.event &&
          ['IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED'].includes(submission.status) &&
          (selectedSubmissionEventId === null || submission.problem.event.id === selectedSubmissionEventId)
      ),
    [submissions, selectedSubmissionEventId]
  );

  const judgingHackathonSubmissions = useMemo(
    () =>
      submissions.filter(
        (submission) =>
          submission.problem.event &&
          submission.status === 'SHORTLISTED' &&
          !submission.isAbsent &&
          (selectedSubmissionEventId === null || submission.problem.event.id === selectedSubmissionEventId)
      ),
    [submissions, selectedSubmissionEventId]
  );

  const reviewableHackathonSubmissionIds = useMemo(
    () =>
      new Set(
        submissions
          .filter((submission) => submission.problem.event && ['IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED', 'SHORTLISTED'].includes(submission.status) && !(submission.status === 'SHORTLISTED' && submission.isAbsent))
          .map((submission) => submission.id)
      ),
    [submissions]
  );

  const getRubricsFromSubmission = (submission: SubmissionRow): HackathonRubricScores => ({
    innovation: submission.innovationScore ?? 0,
    technical: submission.technicalScore ?? 0,
    impact: submission.impactScore ?? 0,
    ux: submission.uxScore ?? 0,
    execution: submission.executionScore ?? 0,
    presentation: submission.presentationScore ?? 0,
    feasibility: submission.feasibilityScore ?? 0,
  });

  const submissionsForDisplay = useMemo(
    () =>
      submissions.filter(
        (submission) =>
          !submission.problem.event || selectedSubmissionEventId === null || submission.problem.event.id === selectedSubmissionEventId
      ),
    [submissions, selectedSubmissionEventId]
  );

  const selectedEventRegistrations = useMemo(() => {
    if (selectedRegistrationEventId === null) return [] as SubmissionRow[];
    return registrationsByEvent[selectedRegistrationEventId] || [];
  }, [registrationsByEvent, selectedRegistrationEventId]);

  const selectedEventProblems = useMemo(() => {
    if (selectedRegistrationEventId === null) return [] as ProblemRow[];
    return problemsByEvent[selectedRegistrationEventId] || [];
  }, [problemsByEvent, selectedRegistrationEventId]);

  const filteredSelectedEventRegistrations = useMemo(() => {
    if (selectedRegistrationProblemId === 'ALL') return selectedEventRegistrations;
    return selectedEventRegistrations.filter((registration) => registration.problem.id === selectedRegistrationProblemId);
  }, [selectedEventRegistrations, selectedRegistrationProblemId]);

  const pendingSelectedEventRegistrations = useMemo(
    () => filteredSelectedEventRegistrations.filter((registration) => ['IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED'].includes(registration.status)),
    [filteredSelectedEventRegistrations]
  );
  const shortlistedSelectedEventRegistrations = useMemo(
    () => filteredSelectedEventRegistrations.filter((registration) => registration.status === 'SHORTLISTED' && !registration.isAbsent),
    [filteredSelectedEventRegistrations]
  );
  const absentSelectedEventRegistrations = useMemo(
    () => filteredSelectedEventRegistrations.filter((registration) => registration.status === 'SHORTLISTED' && registration.isAbsent),
    [filteredSelectedEventRegistrations]
  );
  const rejectedSelectedEventRegistrations = useMemo(
    () => filteredSelectedEventRegistrations.filter((registration) => registration.status === 'REJECTED'),
    [filteredSelectedEventRegistrations]
  );

  const stagedScreeningCountForSelectedSubmissionEvent = useMemo(
    () =>
      screeningHackathonSubmissions.filter((submission) => {
        const decision = stagedDecisions[submission.id];
        return decision === 'SHORTLISTED' || decision === 'REJECTED';
      }).length,
    [screeningHackathonSubmissions, stagedDecisions]
  );

  const stagedJudgingCountForSelectedSubmissionEvent = useMemo(
    () =>
      judgingHackathonSubmissions.filter((submission) => {
        const decision = stagedDecisions[submission.id];
        return decision === 'ACCEPTED' || decision === 'REJECTED';
      }).length,
    [judgingHackathonSubmissions, stagedDecisions]
  );

  const reviewableScreeningCountForSelectedRegistrationEvent = useMemo(
    () => selectedEventRegistrations.filter((registration) => ['IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED'].includes(registration.status)).length,
    [selectedEventRegistrations]
  );

  const reviewableJudgingCountForSelectedRegistrationEvent = useMemo(
    () => selectedEventRegistrations.filter((registration) => registration.status === 'SHORTLISTED' && !registration.isAbsent).length,
    [selectedEventRegistrations]
  );

  useEffect(() => {
    if (manageableEvents.length === 0) {
      setSelectedRegistrationEventId(null);
      return;
    }

    if (
      selectedRegistrationEventId === null ||
      !manageableEvents.some((event) => event.id === selectedRegistrationEventId)
    ) {
      setSelectedRegistrationEventId(manageableEvents[0].id);
    }
  }, [manageableEvents, selectedRegistrationEventId]);

  useEffect(() => {
    setSelectedRegistrationProblemId('ALL');
  }, [selectedRegistrationEventId]);

  useEffect(() => {
    if (hackathonReviewEvents.length === 0) {
      setSelectedSubmissionEventId(null);
      return;
    }

    if (
      selectedSubmissionEventId === null ||
      !hackathonReviewEvents.some((event) => event.id === selectedSubmissionEventId)
    ) {
      setSelectedSubmissionEventId(hackathonReviewEvents[0].id);
    }
  }, [hackathonReviewEvents, selectedSubmissionEventId]);

  useEffect(() => {
    setStagedDecisions((prev) => {
      const next: Record<number, StagedDecisionStatus> = {};
      Object.entries(prev).forEach(([claimId, status]) => {
        const id = Number(claimId);
        if (reviewableHackathonSubmissionIds.has(id)) next[id] = status;
      });
      return next;
    });
  }, [reviewableHackathonSubmissionIds]);

  useEffect(() => {
    setStagedRubrics((prev) => {
      const next: Record<number, HackathonRubricScores> = {};

      submissions
        .filter((submission) => submission.problem.event && submission.status === 'SHORTLISTED' && !submission.isAbsent)
        .forEach((submission) => {
          next[submission.id] = prev[submission.id] || getRubricsFromSubmission(submission);
        });

      return next;
    });
  }, [submissions]);

  const runAction = async (action: () => Promise<void>, success: string) => {
    setLoading(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      await action();
      setStatusMessage(success);
      await loadAll();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  const createProblem = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      await fetchJson('/api/innovation/problems', {
        method: 'POST',
        body: JSON.stringify({
          title: newProblemTitle,
          description: newProblemDescription,
          tags: newProblemTags,
          mode: 'OPEN',
        }),
      });

      setNewProblemTitle('');
      setNewProblemDescription('');
      setNewProblemTags('');
    }, 'Problem created successfully.');
  };

  const archiveProblem = async (problemId: number) => {
    await runAction(async () => {
      await fetchJson(`/api/innovation/problems/${problemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ARCHIVED' }),
      });
    }, 'Problem archived.');
  };

  const stageDecision = (claimId: number, status: StagedDecisionStatus) => {
    setStagedDecisions((prev) => ({
      ...prev,
      [claimId]: status,
    }));
  };

  const setStagedRubricScore = (claimId: number, field: keyof HackathonRubricScores, value: number) => {
    const bounded = Number.isFinite(value) ? Math.max(0, Math.min(10, Math.round(value))) : 0;
    setStagedRubrics((prev) => {
      const base = prev[claimId] || {
        innovation: 0,
        technical: 0,
        impact: 0,
        ux: 0,
        execution: 0,
        presentation: 0,
        feasibility: 0,
      };

      return {
        ...prev,
        [claimId]: {
          ...base,
          [field]: bounded,
        },
      };
    });
  };

  const isRubricComplete = (scores?: HackathonRubricScores) => {
    if (!scores) return false;
    return HACKATHON_RUBRIC_ORDER.every((field) => Number.isInteger(scores[field]) && scores[field] >= 0 && scores[field] <= 10);
  };

  const submitReview = async (claimId: number) => {
    const form = reviewForms[claimId] || { status: 'REVISION_REQUESTED', score: '', feedback: '', badges: '' };

    await runAction(async () => {
      await fetchJson(`/api/innovation/faculty/claims/${claimId}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: form.status,
          score: form.score ? Number(form.score) : undefined,
          feedback: form.feedback,
          badges: form.badges,
        }),
      });

      setReviewForms((prev) => ({
        ...prev,
        [claimId]: { status: 'REVISION_REQUESTED', score: '', feedback: '', badges: '' },
      }));
    }, 'Submission review saved.');
  };

  const syncScreeningForEvent = async (eventId: number) => {
    const eventSubmissions = submissions.filter(
      (submission) =>
        submission.problem.event?.id === eventId && ['IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED'].includes(submission.status)
    );

    if (eventSubmissions.length === 0) {
      setErrorMessage('No PPT-screening submissions are available to sync.');
      return;
    }

    const missing = eventSubmissions.filter((submission) => {
      const decision = stagedDecisions[submission.id];
      return decision !== 'SHORTLISTED' && decision !== 'REJECTED';
    });
    if (missing.length > 0) {
      setErrorMessage('Please mark every PPT submission as Shortlisted or Rejected before screening sync.');
      return;
    }

    await runAction(async () => {
      await fetchJson('/api/innovation/faculty/claims/sync', {
        method: 'PATCH',
        body: JSON.stringify({
          stage: 'SCREENING',
          eventId,
          decisions: eventSubmissions.map((submission) => ({
            claimId: submission.id,
            status: stagedDecisions[submission.id],
          })),
        }),
      });

      setStagedDecisions((prev) => {
        const next = { ...prev };
        eventSubmissions.forEach((submission) => {
          delete next[submission.id];
        });
        return next;
      });
    }, 'PPT screening synced and teams notified about shortlist/rejection.');
  };

  const syncSingleScreeningDecision = async (submission: SubmissionRow, status: ScreeningDecisionStatus) => {
    const eventId = submission.problem.event?.id;
    if (!eventId) {
      setErrorMessage('This submission is not linked to a hackathon event.');
      return;
    }

    await runAction(async () => {
      await fetchJson('/api/innovation/faculty/claims/sync', {
        method: 'PATCH',
        body: JSON.stringify({
          stage: 'SCREENING',
          eventId,
          decisions: [
            {
              claimId: submission.id,
              status,
            },
          ],
        }),
      });

      setStagedDecisions((prev) => {
        const next = { ...prev };
        delete next[submission.id];
        return next;
      });
    }, status === 'SHORTLISTED' ? 'Team shortlisted for judging round.' : 'Team rejected from PPT screening.');
  };

  const syncJudgingForEvent = async (eventId: number) => {
    const eventSubmissions = submissions.filter(
      (submission) => submission.problem.event?.id === eventId && submission.status === 'SHORTLISTED' && !submission.isAbsent
    );

    if (eventSubmissions.length === 0) {
      setErrorMessage('No present shortlisted teams are available for final judging sync.');
      return;
    }

    const eventMeta = events.find((event) => event.id === eventId);
    if (eventMeta?.status !== 'ACTIVE') {
      setErrorMessage('Move the event to ACTIVE status before syncing final judging results.');
      return;
    }

    const missing = eventSubmissions.filter((submission) => {
      const decision = stagedDecisions[submission.id];
      return decision !== 'ACCEPTED' && decision !== 'REJECTED';
    });
    if (missing.length > 0) {
      setErrorMessage('Please mark every shortlisted team with Final Select or Final Reject before judging sync.');
      return;
    }

    const missingRubrics = eventSubmissions.filter((submission) => !isRubricComplete(stagedRubrics[submission.id]));
    if (missingRubrics.length > 0) {
      setErrorMessage('Please enter all rubric scores (0-10) for every shortlisted team before final judging sync.');
      return;
    }

    await runAction(async () => {
      await fetchJson('/api/innovation/faculty/claims/sync', {
        method: 'PATCH',
        body: JSON.stringify({
          stage: 'JUDGING',
          eventId,
          decisions: eventSubmissions.map((submission) => ({
            claimId: submission.id,
            status: stagedDecisions[submission.id],
            rubrics: stagedRubrics[submission.id],
          })),
        }),
      });

      setStagedDecisions((prev) => {
        const next = { ...prev };
        eventSubmissions.forEach((submission) => {
          delete next[submission.id];
        });
        return next;
      });
      setStagedRubrics((prev) => {
        const next = { ...prev };
        eventSubmissions.forEach((submission) => {
          delete next[submission.id];
        });
        return next;
      });
    }, 'Final judging synced and rubric score emails sent to teams.');
  };

  const toggleClaimAbsence = async (claimId: number, isAbsent: boolean) => {
    await runAction(async () => {
      await fetchJson(`/api/innovation/faculty/claims/${claimId}/attendance`, {
        method: 'PATCH',
        body: JSON.stringify({ isAbsent }),
      });

      if (isAbsent) {
        setStagedDecisions((prev) => {
          const next = { ...prev };
          delete next[claimId];
          return next;
        });
        setStagedRubrics((prev) => {
          const next = { ...prev };
          delete next[claimId];
          return next;
        });
      }
    }, isAbsent ? 'Team marked absent for judging round.' : 'Team marked present for judging round.');
  };

  const syncSingleJudgingDecision = async (submission: SubmissionRow, status: JudgingDecisionStatus) => {
    const eventId = submission.problem.event?.id;
    if (!eventId) {
      setErrorMessage('This submission is not linked to a hackathon event.');
      return;
    }

    if (submission.isAbsent) {
      setErrorMessage('This team is marked absent. Mark it present before finalizing judging.');
      return;
    }

    const eventMeta = events.find((event) => event.id === eventId);
    if (eventMeta?.status !== 'ACTIVE') {
      setErrorMessage('Move the event to ACTIVE status before finalizing a specific team.');
      return;
    }

    const rubric = stagedRubrics[submission.id] || getRubricsFromSubmission(submission);
    if (!isRubricComplete(rubric)) {
      setErrorMessage('Fill all rubric scores (0-10) before finalizing this team.');
      return;
    }

    await runAction(async () => {
      await fetchJson('/api/innovation/faculty/claims/sync', {
        method: 'PATCH',
        body: JSON.stringify({
          stage: 'JUDGING',
          eventId,
          decisions: [
            {
              claimId: submission.id,
              status,
              rubrics: rubric,
            },
          ],
        }),
      });

      setStagedDecisions((prev) => {
        const next = { ...prev };
        delete next[submission.id];
        return next;
      });
      setStagedRubrics((prev) => {
        const next = { ...prev };
        delete next[submission.id];
        return next;
      });
    }, status === 'ACCEPTED' ? 'Team finalized as selected in judging.' : 'Team rejected in final judging.');
  };

  const syncScreeningDecisions = async () => {
    if (selectedSubmissionEventId === null) {
      setErrorMessage('Select a hackathon event first.');
      return;
    }
    await syncScreeningForEvent(selectedSubmissionEventId);
  };

  const syncJudgingDecisions = async () => {
    if (selectedSubmissionEventId === null) {
      setErrorMessage('Select a hackathon event first.');
      return;
    }
    await syncJudgingForEvent(selectedSubmissionEventId);
  };

  const createEvent = async (event: React.FormEvent) => {
    event.preventDefault();

    const cleanedProblems = eventProblems
      .map((problem) => ({ title: problem.title.trim(), description: problem.description.trim() }))
      .filter((problem) => problem.title.length > 0 || problem.description.length > 0);

    if (cleanedProblems.length === 0 || cleanedProblems.some((problem) => problem.title.length < 2 || problem.description.length < 5)) {
      setErrorMessage('Add at least one valid hackathon problem with title and description.');
      return;
    }

    await runAction(async () => {
      const formData = new FormData();
      formData.set('title', eventTitle);
      formData.set('description', eventDescription);
      formData.set('startTime', eventStartTime);
      formData.set('endTime', eventEndTime);
      formData.set('problems', JSON.stringify(cleanedProblems));
      if (eventPpt) formData.set('pptFile', eventPpt);

      await fetchJson('/api/innovation/events', {
        method: 'POST',
        body: formData,
      });

      setEventTitle('');
      setEventDescription('');
      setEventStartTime('');
      setEventEndTime('');
      setEventProblems([{ title: '', description: '' }]);
      setEventPpt(null);
    }, 'Hackathon event created successfully.');
  };

  const advanceEventStatus = async (eventId: number, status: 'ACTIVE' | 'CLOSED') => {
    await runAction(async () => {
      await fetchJson(`/api/innovation/admin/events/${eventId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    }, 'Event status updated.');
  };

  const setEventRegistrationOpen = async (eventId: number, registrationOpen: boolean) => {
    await runAction(async () => {
      await fetchJson(`/api/innovation/events/${eventId}`, {
        method: 'PATCH',
        body: JSON.stringify({ registrationOpen }),
      });
    }, `Registration ${registrationOpen ? 'opened' : 'closed'} for event #${eventId}.`);
  };

  const saveEventProblem = async (problem: ProblemRow) => {
    const form = eventProblemForms[problem.id] || { title: problem.title, description: problem.description };
    const title = form.title.trim();
    const description = form.description.trim();

    if (title.length < 2 || description.length < 5) {
      setErrorMessage('Problem title and description are required to update event statements.');
      return;
    }

    await runAction(async () => {
      await fetchJson(`/api/innovation/problems/${problem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, description }),
      });
    }, 'Event problem statement updated.');
  };

  const addEventProblem = async (eventId: number) => {
    const form = eventNewProblemForms[eventId] || { title: '', description: '' };
    const title = form.title.trim();
    const description = form.description.trim();

    if (title.length < 2 || description.length < 5) {
      setErrorMessage('New problem title and description are required.');
      return;
    }

    await runAction(async () => {
      await fetchJson('/api/innovation/problems', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          mode: 'CLOSED',
          eventId,
        }),
      });

      setEventNewProblemForms((prev) => ({
        ...prev,
        [eventId]: { title: '', description: '' },
      }));
    }, 'New problem statement added to event.');
  };

  const renderRubricEditor = (submission: SubmissionRow) => {
    const rubric = stagedRubrics[submission.id] || getRubricsFromSubmission(submission);
    const finalPreview = calculateWeightedHackathonScore(rubric);

    return (
      <div className="mt-3 border border-[#d8dae6] bg-white p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#434651] mb-2">Rubric Scores (0-10)</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {HACKATHON_RUBRIC_ORDER.map((field) => (
            <label key={field} className="text-xs text-[#434651]">
              {HACKATHON_RUBRIC_LABELS[field]} ({HACKATHON_RUBRIC_WEIGHTS[field]}%)
              <input
                type="number"
                min={0}
                max={10}
                step={1}
                className="mt-1 w-full border border-[#747782] p-2 text-xs"
                value={rubric[field]}
                onChange={(e) => setStagedRubricScore(submission.id, field, Number(e.target.value))}
                disabled={loading}
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-[#002155] font-bold">Final Score Preview: {finalPreview}/100</p>
      </div>
    );
  };

  const renderRegistrationCard = (registration: SubmissionRow) => (
    <div key={registration.id} className="border border-[#d8dae6] bg-white p-3 md:p-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#8c4f00]">{registration.status}</p>
          <p className="mt-1 text-sm font-bold text-[#002155]">{registration.teamName || `Team-${registration.id}`}</p>
          <p className="mt-1 text-xs text-[#434651]">Problem Statement: {registration.problem.title}</p>
          {registration.status === 'SHORTLISTED' && registration.isAbsent ? (
            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-[#ba1a1a]">Attendance: Absent</p>
          ) : null}
          <p className="mt-1 text-xs text-[#434651]">
            Members: {registration.members.map((member) => `${member.user.name}${member.user.uid ? ` (${member.user.uid})` : ''}`).join(', ')}
          </p>
        </div>
        {['IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED'].includes(registration.status) ? (
          <div className="flex flex-wrap gap-2 md:justify-end">
            <button
              onClick={() => stageDecision(registration.id, 'SHORTLISTED')}
              className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border ${stagedDecisions[registration.id] === 'SHORTLISTED' ? 'bg-[#0b6b2e] text-white border-[#0b6b2e]' : 'bg-white text-[#0b6b2e] border-[#0b6b2e]'}`}
              disabled={loading}
            >
              Shortlist
            </button>
            <button
              onClick={() => stageDecision(registration.id, 'REJECTED')}
              className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border ${stagedDecisions[registration.id] === 'REJECTED' ? 'bg-[#ba1a1a] text-white border-[#ba1a1a]' : 'bg-white text-[#ba1a1a] border-[#ba1a1a]'}`}
              disabled={loading}
            >
              Reject
            </button>
            <button
              onClick={() => void syncSingleScreeningDecision(registration, 'SHORTLISTED')}
              className="px-3 py-2 text-xs font-bold uppercase tracking-wider border border-[#002155] text-[#002155] bg-white"
              disabled={loading}
            >
              Start Judging
            </button>
          </div>
        ) : registration.status === 'SHORTLISTED' ? (
          <div className="flex flex-wrap gap-2 md:justify-end">
            {registration.isAbsent ? (
              <button
                onClick={() => void toggleClaimAbsence(registration.id, false)}
                className="px-3 py-2 text-xs font-bold uppercase tracking-wider border border-[#002155] text-[#002155] bg-white"
                disabled={loading}
              >
                Mark Present
              </button>
            ) : (
              <>
                <button
                  onClick={() => stageDecision(registration.id, 'ACCEPTED')}
                  className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border ${stagedDecisions[registration.id] === 'ACCEPTED' ? 'bg-[#0b6b2e] text-white border-[#0b6b2e]' : 'bg-white text-[#0b6b2e] border-[#0b6b2e]'}`}
                  disabled={loading}
                >
                  Final Select
                </button>
                <button
                  onClick={() => stageDecision(registration.id, 'REJECTED')}
                  className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border ${stagedDecisions[registration.id] === 'REJECTED' ? 'bg-[#ba1a1a] text-white border-[#ba1a1a]' : 'bg-white text-[#ba1a1a] border-[#ba1a1a]'}`}
                  disabled={loading}
                >
                  Final Reject
                </button>
                <button
                  onClick={() => void syncSingleJudgingDecision(registration, 'ACCEPTED')}
                  className="px-3 py-2 text-xs font-bold uppercase tracking-wider border border-[#0b6b2e] text-[#0b6b2e] bg-white"
                  disabled={loading}
                >
                  Finalize Select
                </button>
                <button
                  onClick={() => void syncSingleJudgingDecision(registration, 'REJECTED')}
                  className="px-3 py-2 text-xs font-bold uppercase tracking-wider border border-[#ba1a1a] text-[#ba1a1a] bg-white"
                  disabled={loading}
                >
                  Finalize Reject
                </button>
                <button
                  onClick={() => void toggleClaimAbsence(registration.id, true)}
                  className="px-3 py-2 text-xs font-bold uppercase tracking-wider border border-[#ba1a1a] text-[#ba1a1a] bg-white"
                  disabled={loading}
                >
                  Mark Absent
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>
      {registration.status === 'SHORTLISTED' && !registration.isAbsent ? renderRubricEditor(registration) : null}
      {registration.status === 'SHORTLISTED' ? (
        <p className="mt-2 text-xs font-bold text-[#002155]">
          {registration.isAbsent
            ? 'Team is shortlisted but marked absent for judging round.'
            : 'Team is shortlisted from PPT screening and awaiting final judging sync.'}
        </p>
      ) : null}
      {['ACCEPTED', 'REJECTED'].includes(registration.status) ? (
        <p className="mt-2 text-xs font-bold text-[#002155]">Final Score: {registration.finalScore ?? registration.score ?? 'N/A'}/100</p>
      ) : null}
      {registration.submissionFileUrl ? (
        <details className="mt-3 border border-[#e3e2df] bg-[#faf9f5] p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-[#002155]">View Uploaded PPT/PDF</summary>
          <iframe
            src={registration.submissionFileUrl}
            title={`Registration file ${registration.id}`}
            className="mt-3 w-full h-64 border border-[#c4c6d3] bg-white"
          />
          <a href={registration.submissionFileUrl} target="_blank" rel="noreferrer" className="inline-flex mt-2 text-xs font-bold uppercase tracking-wider text-[#8c4f00] underline">
            Open File in New Tab
          </a>
        </details>
      ) : (
        <p className="mt-2 text-xs text-[#434651]">No PPT uploaded.</p>
      )}
    </div>
  );

  const workspaceStats = useMemo(
    () => ({
      ownOpenProblems: ownProblems.length,
      reviewQueue: screeningHackathonSubmissions.length + judgingHackathonSubmissions.length,
      managedEvents: manageableEvents.length,
      eventTeams: filteredSelectedEventRegistrations.length,
    }),
    [ownProblems.length, screeningHackathonSubmissions.length, judgingHackathonSubmissions.length, manageableEvents.length, filteredSelectedEventRegistrations.length]
  );

  const activeTabDescription =
    activeTab === 'problems'
      ? 'Author open innovation problems and maintain your existing statements.'
      : activeTab === 'submissions'
        ? 'Process screening and final judging in one focused review queue.'
        : 'Create events, control lifecycle, and manage registered teams.';

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-8 pt-[116px] pb-16 min-h-screen">
      <header className="mb-6 border border-[#002155] bg-[linear-gradient(125deg,#0f2d57_0%,#1d4a7d_52%,#295f97_100%)] p-6 md:p-8 text-white shadow-[0_18px_45px_-28px_rgba(0,33,85,0.9)]">
        <p className="text-[11px] uppercase tracking-[0.26em] text-[#d3e7ff] font-bold">Innovation Operations Console</p>
        <h1 className="mt-2 font-headline text-3xl md:text-[42px] font-bold tracking-tight leading-none">Faculty Workspace</h1>
        <p className="mt-3 text-[#e5f0ff] max-w-3xl text-sm md:text-base">
          Review teams faster with focused queues, structured actions, and clean event controls.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/innovation" className="bg-white text-[#002155] px-4 py-2 text-xs font-bold uppercase tracking-wider border border-white">
            Innovation Home
          </Link>
          <Link href="/innovation/problems" className="border border-[#d3e7ff] text-[#d3e7ff] px-4 py-2 text-xs font-bold uppercase tracking-wider">
            Problems Board
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
          <div className="border border-[#87acd6] bg-[#ffffff14] p-3">
            <p className="text-[10px] uppercase tracking-widest text-[#d8ebff] font-bold">Open Problems</p>
            <p className="mt-1 text-2xl font-bold">{workspaceStats.ownOpenProblems}</p>
          </div>
          <div className="border border-[#87acd6] bg-[#ffffff14] p-3">
            <p className="text-[10px] uppercase tracking-widest text-[#d8ebff] font-bold">Review Queue</p>
            <p className="mt-1 text-2xl font-bold">{workspaceStats.reviewQueue}</p>
          </div>
          <div className="border border-[#87acd6] bg-[#ffffff14] p-3">
            <p className="text-[10px] uppercase tracking-widest text-[#d8ebff] font-bold">Managed Events</p>
            <p className="mt-1 text-2xl font-bold">{workspaceStats.managedEvents}</p>
          </div>
          <div className="border border-[#87acd6] bg-[#ffffff14] p-3">
            <p className="text-[10px] uppercase tracking-widest text-[#d8ebff] font-bold">Teams (Filtered)</p>
            <p className="mt-1 text-2xl font-bold">{workspaceStats.eventTeams}</p>
          </div>
        </div>
      </header>

      {statusMessage ? <p className="mb-4 border border-green-300 bg-green-50 text-green-800 px-4 py-3 text-sm">{statusMessage}</p> : null}
      {errorMessage ? <p className="mb-4 border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm">{errorMessage}</p> : null}

      <section className="mb-8 border border-[#c4c6d3] bg-white p-4 md:p-5">
        <p className="text-[11px] uppercase tracking-[0.22em] text-[#747782] font-bold">Workspace Sections</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab('problems')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border ${
              activeTab === 'problems' ? 'bg-[#002155] text-white border-[#002155]' : 'bg-[#f5f4f0] text-[#002155] border-[#c4c6d3]'
            }`}
          >
            Problems
          </button>
          <button
            onClick={() => setActiveTab('submissions')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border ${
              activeTab === 'submissions' ? 'bg-[#002155] text-white border-[#002155]' : 'bg-[#f5f4f0] text-[#002155] border-[#c4c6d3]'
            }`}
          >
            Submissions
          </button>
          <button
            onClick={() => setActiveTab('events')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border ${
              activeTab === 'events' ? 'bg-[#002155] text-white border-[#002155]' : 'bg-[#f5f4f0] text-[#002155] border-[#c4c6d3]'
            }`}
          >
            Hackathon Events
          </button>
        </div>
        <p className="mt-3 text-sm text-[#434651]">{activeTabDescription}</p>
      </section>

      {activeTab === 'problems' ? (
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="border border-[#c4c6d3] bg-white p-5 md:p-6 shadow-[0_20px_32px_-30px_rgba(0,33,85,0.55)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#747782]">Authoring</p>
            <h2 className="font-headline text-2xl text-[#002155] mt-2 mb-4">Create Open Problem</h2>
            <form className="space-y-4" onSubmit={createProblem}>
              <input className="w-full border border-[#747782] p-3 text-sm" placeholder="Title" value={newProblemTitle} onChange={(e) => setNewProblemTitle(e.target.value)} required />
              <textarea className="w-full border border-[#747782] p-3 text-sm min-h-[110px]" placeholder="Description" value={newProblemDescription} onChange={(e) => setNewProblemDescription(e.target.value)} required />
              <input className="w-full border border-[#747782] p-3 text-sm" placeholder="Tags (comma-separated)" value={newProblemTags} onChange={(e) => setNewProblemTags(e.target.value)} />
              <p className="text-xs text-[#434651]">This section is for OPEN innovation problems only. Hackathon problem statements are managed in the Hackathon Events tab.</p>
              <button type="submit" disabled={loading} className="bg-[#002155] text-white px-4 py-3 text-xs font-bold uppercase tracking-wider">Create Problem</button>
            </form>
          </div>

          <div className="border border-[#c4c6d3] bg-[#f5f4f0] p-5 md:p-6 shadow-[0_20px_32px_-30px_rgba(0,33,85,0.55)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#747782]">Maintenance</p>
            <h2 className="font-headline text-2xl text-[#002155] mt-2 mb-4">Own Problems</h2>
            {ownProblems.length === 0 ? (
              <p className="text-sm text-[#434651]">No authored problems yet.</p>
            ) : (
              <div className="space-y-3">
                {ownProblems.map((problem) => (
                  <article key={problem.id} className="border border-[#e3e2df] bg-white p-4">
                    <p className="text-sm font-bold text-[#002155]">{problem.title}</p>
                    <p className="mt-1 text-xs text-[#434651]">{problem.mode} • {problem.status} • Claims: {problem._count.claims}</p>
                    {problem.status !== 'ARCHIVED' ? (
                      <button onClick={() => void archiveProblem(problem.id)} className="mt-3 border border-[#ba1a1a] text-[#ba1a1a] px-3 py-2 text-xs font-bold uppercase tracking-wider">
                        Archive
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {activeTab === 'submissions' ? (
        <section className="space-y-5">
          <div className="border border-[#c4c6d3] bg-white p-4 md:p-5 shadow-[0_20px_32px_-30px_rgba(0,33,85,0.55)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#747782]">Review Controls</p>
            <div className="mt-3 grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-4 items-start">
              <div className="space-y-3">
                <h2 className="font-headline text-2xl text-[#002155]">Claims and Submissions</h2>
                <select
                  className="border border-[#747782] p-2 text-xs md:w-[360px] bg-[#fdfdfd]"
                  value={selectedSubmissionEventId ?? ''}
                  onChange={(e) => setSelectedSubmissionEventId(Number(e.target.value))}
                  disabled={hackathonReviewEvents.length === 0}
                >
                  {hackathonReviewEvents.length === 0 ? (
                    <option value="">No hackathon event reviews pending</option>
                  ) : (
                    hackathonReviewEvents.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.title}
                      </option>
                    ))
                  )}
                </select>
                <p className="text-xs text-[#434651]">
                  Screening staged: {stagedScreeningCountForSelectedSubmissionEvent}/{screeningHackathonSubmissions.length} | Judging staged: {stagedJudgingCountForSelectedSubmissionEvent}/{judgingHackathonSubmissions.length}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 xl:justify-end">
                <button
                  onClick={() => void syncScreeningDecisions()}
                  disabled={loading || selectedSubmissionEventId === null || screeningHackathonSubmissions.length === 0}
                  className="bg-[#002155] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-70"
                >
                  Sync PPT Screening
                </button>
                <button
                  onClick={() => void syncJudgingDecisions()}
                  disabled={loading || selectedSubmissionEventId === null || judgingHackathonSubmissions.length === 0}
                  className="bg-[#0b6b2e] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-70"
                >
                  Sync Final Judging
                </button>
              </div>
            </div>
          </div>

          <details className="border border-[#c4c6d3] bg-[#f5f4f0] p-4" open>
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-[#002155]">Final Judging Rubric Guide</summary>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-[#434651]">
              {HACKATHON_RUBRIC_ORDER.map((field) => (
                <p key={field}>
                  {HACKATHON_RUBRIC_LABELS[field]}: 0-10 ({HACKATHON_RUBRIC_WEIGHTS[field]}%)
                </p>
              ))}
            </div>
          </details>

          {submissionsForDisplay.length === 0 ? (
            <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No claims found for your authored problems.</p>
          ) : (
            <div className="space-y-3">
              {submissionsForDisplay.map((submission) => {
                const canScreen = submission.status === 'IN_PROGRESS' || submission.status === 'SUBMITTED' || submission.status === 'REVISION_REQUESTED';
                const canJudge = submission.status === 'SHORTLISTED' && !submission.isAbsent;
                const isHackathonSubmission = !!submission.problem.event;
                const staged = stagedDecisions[submission.id] || null;
                const form = reviewForms[submission.id] || { status: 'REVISION_REQUESTED', score: '', feedback: '', badges: '' };

                return (
                  <details key={submission.id} className="group border border-[#c4c6d3] bg-white">
                    <summary className="list-none cursor-pointer p-4 md:p-5">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8c4f00]">{submission.status}</p>
                          <h3 className="mt-1 text-base font-bold text-[#002155]">{submission.problem.title}</h3>
                          <p className="mt-1 text-xs text-[#434651]">Team: {submission.teamName || 'Individual'}</p>
                        </div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[#747782]">Expand to review</p>
                      </div>
                    </summary>

                    <div className="border-t border-[#e3e2df] p-4 md:p-5">
                      <p className="text-xs text-[#434651]">
                        Members: {submission.members.map((member) => `${member.user.name}${member.user.uid ? ` (${member.user.uid})` : ''}`).join(', ')}
                      </p>
                      {submission.status === 'SHORTLISTED' && submission.isAbsent ? (
                        <p className="mt-1 text-xs font-bold uppercase tracking-wider text-[#ba1a1a]">Attendance: Absent</p>
                      ) : null}
                      {['ACCEPTED', 'REJECTED'].includes(submission.status) ? (
                        <p className="mt-1 text-xs font-bold text-[#002155]">Final Score: {submission.finalScore ?? submission.score ?? 'N/A'}/100</p>
                      ) : null}
                      {submission.problem.event ? (
                        <Link
                          href={`/innovation/events/${submission.problem.event.id}`}
                          className="inline-flex mt-2 mr-3 text-xs font-bold uppercase tracking-wider text-[#002155] underline"
                        >
                          View Event Page
                        </Link>
                      ) : null}
                      {submission.submissionUrl ? (
                        <a href={submission.submissionUrl} target="_blank" rel="noreferrer" className="inline-block mt-2 text-xs font-bold uppercase tracking-wider text-[#8c4f00] underline">
                          Open Submission URL
                        </a>
                      ) : null}

                      {(canScreen || canJudge) && isHackathonSubmission ? (
                        <div className="mt-4 border border-[#e3e2df] bg-[#faf9f5] p-3">
                          <p className="text-xs text-[#434651] mb-2">
                            {canScreen
                              ? 'Stage 1: review PPT quality and shortlist teams for final judging.'
                              : 'Stage 2: assign rubric scores and finalize the team decision.'}
                          </p>
                          {canScreen ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => stageDecision(submission.id, 'SHORTLISTED')}
                                className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border ${staged === 'SHORTLISTED' ? 'bg-[#0b6b2e] text-white border-[#0b6b2e]' : 'bg-white text-[#0b6b2e] border-[#0b6b2e]'}`}
                                disabled={loading}
                              >
                                Shortlist
                              </button>
                              <button
                                onClick={() => stageDecision(submission.id, 'REJECTED')}
                                className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border ${staged === 'REJECTED' ? 'bg-[#ba1a1a] text-white border-[#ba1a1a]' : 'bg-white text-[#ba1a1a] border-[#ba1a1a]'}`}
                                disabled={loading}
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => stageDecision(submission.id, 'ACCEPTED')}
                                className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border ${staged === 'ACCEPTED' ? 'bg-[#0b6b2e] text-white border-[#0b6b2e]' : 'bg-white text-[#0b6b2e] border-[#0b6b2e]'}`}
                                disabled={loading}
                              >
                                Final Select
                              </button>
                              <button
                                onClick={() => stageDecision(submission.id, 'REJECTED')}
                                className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border ${staged === 'REJECTED' ? 'bg-[#ba1a1a] text-white border-[#ba1a1a]' : 'bg-white text-[#ba1a1a] border-[#ba1a1a]'}`}
                                disabled={loading}
                              >
                                Final Reject
                              </button>
                            </div>
                          )}
                          <p className="mt-2 text-xs text-[#434651]">
                            Current staged decision: <span className="font-bold">{staged ? staged : 'Not marked'}</span>
                          </p>
                          {canJudge ? renderRubricEditor(submission) : null}
                        </div>
                      ) : submission.status === 'SHORTLISTED' && submission.isAbsent ? (
                        <div className="mt-4 border border-[#f1b7b7] bg-[#fff3f3] p-3">
                          <p className="text-xs font-bold uppercase tracking-wider text-[#ba1a1a]">Team marked absent for judging round</p>
                          <p className="mt-1 text-xs text-[#7f2a2a]">Mark the team present to re-enable final judging actions for this submission.</p>
                          <button
                            onClick={() => void toggleClaimAbsence(submission.id, false)}
                            className="mt-2 px-3 py-2 text-xs font-bold uppercase tracking-wider border border-[#002155] text-[#002155] bg-white"
                            disabled={loading}
                          >
                            Mark Present
                          </button>
                        </div>
                      ) : canScreen ? (
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                          <select className="border border-[#747782] p-2 text-xs" value={form.status} onChange={(e) => setReviewForms((prev) => ({ ...prev, [submission.id]: { ...form, status: e.target.value as 'ACCEPTED' | 'REVISION_REQUESTED' | 'REJECTED' } }))}>
                            <option value="ACCEPTED">ACCEPTED</option>
                            <option value="REVISION_REQUESTED">REVISION_REQUESTED</option>
                            <option value="REJECTED">REJECTED</option>
                          </select>
                          <input className="border border-[#747782] p-2 text-xs" placeholder="Score (0-100)" value={form.score} onChange={(e) => setReviewForms((prev) => ({ ...prev, [submission.id]: { ...form, score: e.target.value } }))} />
                          <input className="border border-[#747782] p-2 text-xs" placeholder="Badges" value={form.badges} onChange={(e) => setReviewForms((prev) => ({ ...prev, [submission.id]: { ...form, badges: e.target.value } }))} />
                          <input className="border border-[#747782] p-2 text-xs" placeholder="Feedback" value={form.feedback} onChange={(e) => setReviewForms((prev) => ({ ...prev, [submission.id]: { ...form, feedback: e.target.value } }))} />
                          <button onClick={() => void submitReview(submission.id)} className="md:col-span-2 bg-[#002155] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider md:w-fit">
                            Submit Review
                          </button>
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-[#434651]">Claim is created. Review will be available after the team submits URL/file.</p>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {activeTab === 'events' ? (
        <>
          <section className="mb-5 border border-[#c4c6d3] bg-white p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#747782]">Event Workspace</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setEventsSubTab('create')} className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border ${eventsSubTab === 'create' ? 'bg-[#002155] text-white border-[#002155]' : 'bg-[#f5f4f0] text-[#002155] border-[#c4c6d3]'}`}>Create Event</button>
              <button onClick={() => setEventsSubTab('manage')} className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border ${eventsSubTab === 'manage' ? 'bg-[#002155] text-white border-[#002155]' : 'bg-[#f5f4f0] text-[#002155] border-[#c4c6d3]'}`}>Manage Event</button>
              <button onClick={() => setEventsSubTab('teams')} className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border ${eventsSubTab === 'teams' ? 'bg-[#002155] text-white border-[#002155]' : 'bg-[#f5f4f0] text-[#002155] border-[#c4c6d3]'}`}>Registered Teams</button>
            </div>
          </section>

          {eventsSubTab === 'create' ? (
            <section className="border border-[#c4c6d3] bg-white p-5 md:p-6 shadow-[0_20px_32px_-30px_rgba(0,33,85,0.55)]">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#747782]">Setup</p>
              <h2 className="font-headline text-2xl text-[#002155] mt-2 mb-4">Create Hackathon Event</h2>
              <form className="space-y-4" onSubmit={createEvent}>
                <input className="w-full border border-[#747782] p-3 text-sm" placeholder="Title" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} required />
                <textarea className="w-full border border-[#747782] p-3 text-sm min-h-[110px]" placeholder="Description" value={eventDescription} onChange={(e) => setEventDescription(e.target.value)} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input type="datetime-local" className="w-full border border-[#747782] p-3 text-sm" value={eventStartTime} onChange={(e) => setEventStartTime(e.target.value)} required />
                  <input type="datetime-local" className="w-full border border-[#747782] p-3 text-sm" value={eventEndTime} onChange={(e) => setEventEndTime(e.target.value)} required />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-widest text-[#434651] font-bold">Hackathon Problem Statements</p>
                    <button
                      type="button"
                      onClick={() => setEventProblems((prev) => [...prev, { title: '', description: '' }])}
                      className="border border-[#002155] text-[#002155] px-3 py-2 text-[10px] font-bold uppercase tracking-wider"
                    >
                      Add Problem
                    </button>
                  </div>

                  {eventProblems.map((problem, index) => (
                    <div key={index} className="border border-[#e3e2df] p-3 bg-[#faf9f5] space-y-2">
                      <input
                        className="w-full border border-[#747782] p-3 text-sm"
                        placeholder={`Problem ${index + 1} title`}
                        value={problem.title}
                        onChange={(e) =>
                          setEventProblems((prev) => {
                            const next = [...prev];
                            next[index] = { ...next[index], title: e.target.value };
                            return next;
                          })
                        }
                        required
                      />
                      <textarea
                        className="w-full border border-[#747782] p-3 text-sm min-h-[90px]"
                        placeholder={`Problem ${index + 1} description`}
                        value={problem.description}
                        onChange={(e) =>
                          setEventProblems((prev) => {
                            const next = [...prev];
                            next[index] = { ...next[index], description: e.target.value };
                            return next;
                          })
                        }
                        required
                      />
                      {eventProblems.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setEventProblems((prev) => prev.filter((_, i) => i !== index))}
                          className="border border-[#ba1a1a] text-[#ba1a1a] px-3 py-2 text-[10px] font-bold uppercase tracking-wider"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-3">
                  <p className="text-xs text-[#434651] mb-2">Optional event brief (PPT/PDF) shown to participants.</p>
                  <input type="file" accept=".ppt,.pptx,.pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf" onChange={(e) => setEventPpt(e.target.files?.[0] ?? null)} />
                </div>
                <button type="submit" disabled={loading} className="bg-[#002155] text-white px-4 py-3 text-xs font-bold uppercase tracking-wider">Create Event</button>
              </form>
            </section>
          ) : null}

          {eventsSubTab === 'manage' ? (
            <section className="border border-[#c4c6d3] bg-[#f5f4f0] p-5 md:p-6 shadow-[0_20px_32px_-30px_rgba(0,33,85,0.55)]">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#747782]">Lifecycle</p>
              <h2 className="font-headline text-2xl text-[#002155] mt-2 mb-4">Manage Event</h2>
              {manageableEvents.length === 0 ? (
                <p className="text-sm text-[#434651]">No events available for your account.</p>
              ) : (
                <div className="space-y-3">
                  {manageableEvents.map((event) => (
                    <article key={event.id} className="border border-[#d8dae6] bg-white p-4 md:p-5">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <p className="text-sm md:text-base font-bold text-[#002155]">{event.title}</p>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8c4f00]">{event.status}</p>
                      </div>
                      <p className="mt-1 text-xs text-[#434651]">Problems: {event._count.problems}</p>
                      <p className="mt-1 text-xs text-[#434651]">Registration: {event.registrationOpen ? 'OPEN' : 'CLOSED'}</p>
                      <p className="mt-1 text-xs text-[#434651]">{new Date(event.startTime).toLocaleString()} to {new Date(event.endTime).toLocaleString()}</p>
                      <Link
                        href={`/innovation/events/${event.id}`}
                        className="inline-flex mt-3 border border-[#002155] text-[#002155] px-3 py-2 text-xs font-bold uppercase tracking-wider"
                      >
                        View Event Page
                      </Link>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {event.registrationOpen ? (
                          <button
                            onClick={() => void setEventRegistrationOpen(event.id, false)}
                            className="border border-[#ba1a1a] text-[#ba1a1a] px-3 py-2 text-xs font-bold uppercase tracking-wider"
                          >
                            Close Registration
                          </button>
                        ) : (
                          <button
                            onClick={() => void setEventRegistrationOpen(event.id, true)}
                            className="border border-[#002155] text-[#002155] px-3 py-2 text-xs font-bold uppercase tracking-wider"
                          >
                            Open Registration
                          </button>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {event.status === 'UPCOMING' ? (
                          <button onClick={() => void advanceEventStatus(event.id, 'ACTIVE')} className="bg-[#002155] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider">Mark ACTIVE</button>
                        ) : null}
                        {event.status === 'ACTIVE' || event.status === 'JUDGING' ? (
                          <button onClick={() => void advanceEventStatus(event.id, 'CLOSED')} className="bg-[#002155] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider">Mark CLOSED</button>
                        ) : null}
                      </div>

                      <details className="mt-4 border border-[#e3e2df] bg-[#faf9f5] p-3">
                        <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-[#434651]">Edit Event Problem Statements</summary>
                        <div className="mt-3">
                        {(problemsByEvent[event.id] || []).length === 0 ? (
                          <p className="text-xs text-[#434651]">No problem statements found for this event.</p>
                        ) : (
                          <div className="space-y-3">
                            {(problemsByEvent[event.id] || []).map((problem) => {
                              const form = eventProblemForms[problem.id] || { title: problem.title, description: problem.description };
                              return (
                                <div key={problem.id} className="border border-[#d8dae6] bg-white p-3 space-y-2">
                                  <p className="text-[10px] uppercase tracking-widest text-[#8c4f00]">Problem #{problem.id}</p>
                                  <input
                                    className="w-full border border-[#747782] p-2 text-xs"
                                    value={form.title}
                                    onChange={(e) =>
                                      setEventProblemForms((prev) => ({
                                        ...prev,
                                        [problem.id]: { ...form, title: e.target.value },
                                      }))
                                    }
                                  />
                                  <textarea
                                    className="w-full border border-[#747782] p-2 text-xs min-h-[80px]"
                                    value={form.description}
                                    onChange={(e) =>
                                      setEventProblemForms((prev) => ({
                                        ...prev,
                                        [problem.id]: { ...form, description: e.target.value },
                                      }))
                                    }
                                  />
                                  <button
                                    onClick={() => void saveEventProblem(problem)}
                                    className="bg-[#002155] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider"
                                    disabled={loading}
                                  >
                                    Save Problem
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="mt-4 border-t border-[#d8dae6] pt-3 space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-[#434651]">Add New Problem Statement</p>
                          <input
                            className="w-full border border-[#747782] p-2 text-xs bg-white"
                            placeholder="New problem title"
                            value={(eventNewProblemForms[event.id]?.title || '')}
                            onChange={(e) =>
                              setEventNewProblemForms((prev) => ({
                                ...prev,
                                [event.id]: {
                                  title: e.target.value,
                                  description: prev[event.id]?.description || '',
                                },
                              }))
                            }
                          />
                          <textarea
                            className="w-full border border-[#747782] p-2 text-xs min-h-[80px] bg-white"
                            placeholder="New problem description"
                            value={(eventNewProblemForms[event.id]?.description || '')}
                            onChange={(e) =>
                              setEventNewProblemForms((prev) => ({
                                ...prev,
                                [event.id]: {
                                  title: prev[event.id]?.title || '',
                                  description: e.target.value,
                                },
                              }))
                            }
                          />
                          <button
                            onClick={() => void addEventProblem(event.id)}
                            className="border border-[#002155] text-[#002155] px-3 py-2 text-xs font-bold uppercase tracking-wider bg-white"
                            disabled={loading}
                          >
                            Add Problem Statement
                          </button>
                        </div>
                        </div>
                      </details>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {eventsSubTab === 'teams' ? (
            <section className="border border-[#c4c6d3] bg-white p-5 md:p-6 shadow-[0_20px_32px_-30px_rgba(0,33,85,0.55)]">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#747782]">Operations Queue</p>
                  <h2 className="font-headline text-2xl text-[#002155] mt-1">Registered Teams</h2>
                </div>
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  {manageableEvents.length > 0 ? (
                    <select
                      className="border border-[#747782] p-2 text-xs md:w-[320px]"
                      value={selectedRegistrationEventId ?? ''}
                      onChange={(e) => setSelectedRegistrationEventId(Number(e.target.value))}
                    >
                      {manageableEvents.map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.title}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {selectedRegistrationEventId !== null && selectedEventProblems.length > 0 ? (
                    <select
                      className="border border-[#747782] p-2 text-xs md:w-[320px]"
                      value={selectedRegistrationProblemId}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSelectedRegistrationProblemId(value === 'ALL' ? 'ALL' : Number(value));
                      }}
                    >
                      <option value="ALL">All Problem Statements</option>
                      {selectedEventProblems.map((problem) => (
                        <option key={problem.id} value={problem.id}>
                          {problem.title}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <button
                    onClick={() => selectedRegistrationEventId && void syncScreeningForEvent(selectedRegistrationEventId)}
                    disabled={loading || selectedRegistrationEventId === null || reviewableScreeningCountForSelectedRegistrationEvent === 0}
                    className="bg-[#002155] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-70"
                  >
                    Sync PPT Screening
                  </button>
                  <button
                    onClick={() => selectedRegistrationEventId && void syncJudgingForEvent(selectedRegistrationEventId)}
                    disabled={loading || selectedRegistrationEventId === null || reviewableJudgingCountForSelectedRegistrationEvent === 0}
                    className="bg-[#0b6b2e] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-70"
                  >
                    Sync Final Judging
                  </button>
                </div>
              </div>

              {manageableEvents.length === 0 ? (
                <p className="text-sm text-[#434651]">No events available for your account.</p>
              ) : selectedRegistrationEventId === null ? (
                <p className="text-sm text-[#434651]">Select an event to view registrations.</p>
              ) : filteredSelectedEventRegistrations.length === 0 ? (
                <p className="text-sm text-[#434651]">No teams found for this event/problem selection.</p>
              ) : (
                <>
                  <div className="mb-4 border border-[#c4c6d3] bg-[#f5f4f0] p-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#002155] mb-2">Final Judging Rubric Guide</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-[#434651]">
                      {HACKATHON_RUBRIC_ORDER.map((field) => (
                        <p key={field}>
                          {HACKATHON_RUBRIC_LABELS[field]}: 0-10 ({HACKATHON_RUBRIC_WEIGHTS[field]}%)
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="border border-[#d8dae6] bg-[#faf9f5] p-2 text-[#434651]">Total: <span className="font-bold">{filteredSelectedEventRegistrations.length}</span></div>
                    <div className="border border-[#d8dae6] bg-[#faf9f5] p-2 text-[#8c4f00]">Shortlisted: <span className="font-bold">{shortlistedSelectedEventRegistrations.length}</span></div>
                    <div className="border border-[#d8dae6] bg-[#faf9f5] p-2 text-[#ba1a1a]">Absent: <span className="font-bold">{absentSelectedEventRegistrations.length}</span></div>
                    <div className="border border-[#d8dae6] bg-[#faf9f5] p-2 text-[#ba1a1a]">Rejected: <span className="font-bold">{rejectedSelectedEventRegistrations.length}</span></div>
                  </div>

                  <div className="space-y-5">
                    <details open className="border border-[#d8dae6] bg-[#faf9f5] p-3">
                      <summary className="cursor-pointer text-sm font-bold uppercase tracking-wider text-[#8c4f00]">Pending Teams ({pendingSelectedEventRegistrations.length})</summary>
                      {pendingSelectedEventRegistrations.length === 0 ? (
                        <p className="text-xs text-[#434651] mt-3">No pending teams in this filter.</p>
                      ) : (
                        <div className="space-y-3 mt-3">{pendingSelectedEventRegistrations.map((registration) => renderRegistrationCard(registration))}</div>
                      )}
                    </details>

                    <details open className="border border-[#d8dae6] bg-[#faf9f5] p-3">
                      <summary className="cursor-pointer text-sm font-bold uppercase tracking-wider text-[#8c4f00]">Shortlisted Teams ({shortlistedSelectedEventRegistrations.length})</summary>
                      {shortlistedSelectedEventRegistrations.length === 0 ? (
                        <p className="text-xs text-[#434651] mt-3">No shortlisted teams in this filter.</p>
                      ) : (
                        <div className="space-y-3 mt-3">{shortlistedSelectedEventRegistrations.map((registration) => renderRegistrationCard(registration))}</div>
                      )}
                    </details>

                    <details className="border border-[#d8dae6] bg-[#faf9f5] p-3">
                      <summary className="cursor-pointer text-sm font-bold uppercase tracking-wider text-[#ba1a1a]">Absent Teams ({absentSelectedEventRegistrations.length})</summary>
                      {absentSelectedEventRegistrations.length === 0 ? (
                        <p className="text-xs text-[#434651] mt-3">No absent teams in this filter.</p>
                      ) : (
                        <div className="space-y-3 mt-3">{absentSelectedEventRegistrations.map((registration) => renderRegistrationCard(registration))}</div>
                      )}
                    </details>

                    <details className="border border-[#d8dae6] bg-[#faf9f5] p-3">
                      <summary className="cursor-pointer text-sm font-bold uppercase tracking-wider text-[#ba1a1a]">Rejected Teams ({rejectedSelectedEventRegistrations.length})</summary>
                      {rejectedSelectedEventRegistrations.length === 0 ? (
                        <p className="text-xs text-[#434651] mt-3">No rejected teams in this filter.</p>
                      ) : (
                        <div className="space-y-3 mt-3">{rejectedSelectedEventRegistrations.map((registration) => renderRegistrationCard(registration))}</div>
                      )}
                    </details>
                  </div>
                </>
              )}
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
