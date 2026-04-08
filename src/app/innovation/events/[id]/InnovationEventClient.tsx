"use client";

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { trackEvent } from '@/lib/analytics';
import { usePathname } from "next/navigation";
import { useToast } from "@/components/ToastProvider";

const descriptionUrlRegex = /((https?:\/\/|www\.)[^\s<>"]+)/gi;

const renderTextWithClickableLinks = (text: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(descriptionUrlRegex)) {
    const matchedUrl = match[0];
    const startIndex = match.index ?? 0;

    if (startIndex > lastIndex) {
      nodes.push(text.slice(lastIndex, startIndex));
    }

    const href = matchedUrl.startsWith('http://') || matchedUrl.startsWith('https://')
      ? matchedUrl
      : `https://${matchedUrl}`;

    nodes.push(
      <a
        key={`desc-link-${startIndex}-${matchedUrl}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-[#002155] font-semibold break-all"
      >
        {matchedUrl}
      </a>
    );

    lastIndex = startIndex + matchedUrl.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
};

type ProblemLite = {
  id: number;
  title: string;
  description: string;
  isIndustryProblem: boolean;
  industryName: string | null;
  mode: string;
  status: string;
};

type LeaderboardRow = {
  rank: number;
  teamName: string;
  score: number;
  updatedAt: string;
  members: { id: number; name: string; email: string; role: string }[];
};

type UidLookupRow = {
  uid: string;
  found: boolean;
  eligible: boolean;
  alreadyParticipated: boolean;
  reason: string;
  name: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
  isVerified: boolean | null;
};

type ExistingRegistrationSummary = {
  claimId: number;
  teamName: string;
  problem: {
    id: number;
    title: string;
  };
  teamLeader: {
    id: number;
    name: string;
    email: string;
    uid: string | null;
  } | null;
  members: Array<{
    role: string;
    user: {
      id: number;
      name: string;
      email: string;
      uid: string | null;
    };
  }>;
  submissionFileUrl: string | null;
  submittedAt: string;
  createdAt: string;
};

type InnovationEventClientProps = {
  eventId: number;
  title: string;
  description: string | null;
  status: 'UPCOMING' | 'ACTIVE' | 'JUDGING' | 'CLOSED';
  registrationOpen: boolean;
  startTimeISO: string;
  endTimeISO: string;
  submissionLockISO: string | null;
  registrationCloseISO: string;
  eventBriefUrl: string | null;
  problems: ProblemLite[];
  viewerRole: 'STUDENT' | 'FACULTY' | 'ADMIN' | null;
  initialRegistration: ExistingRegistrationSummary | null;
};

export default function InnovationEventClient({
  eventId,
  title,
  description,
  status,
  registrationOpen,
  startTimeISO,
  endTimeISO,
  submissionLockISO,
  registrationCloseISO,
  eventBriefUrl,
  problems,
  viewerRole,
  initialRegistration,
}: InnovationEventClientProps) {
  const [selectedProblem, setSelectedProblem] = useState<ProblemLite | null>(null);
  const [selectedProblemIndex, setSelectedProblemIndex] = useState<number | null>(null);
  const [teamName, setTeamName] = useState('');
  const [teamSize, setTeamSize] = useState(1);
  const [teamLeadUid, setTeamLeadUid] = useState('');
  const [memberUids, setMemberUids] = useState<string[]>([]);
  const [problemId, setProblemId] = useState<number>(problems[0]?.id ?? 0);
  const [pptFile, setPptFile] = useState<File | null>(null);
  const pathname = usePathname();
  const { pushToast } = useToast();

  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [uidLookupBusy, setUidLookupBusy] = useState(false);
  const [uidLookupMessage, setUidLookupMessage] = useState('');
  const [uidLookupRows, setUidLookupRows] = useState<UidLookupRow[]>([]);
  const [verifiedUidSnapshot, setVerifiedUidSnapshot] = useState('');
  const [registrationSummary, setRegistrationSummary] = useState<ExistingRegistrationSummary | null>(initialRegistration);

  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  const trackSafe = (eventName: string, params?: Record<string, string | number | boolean>) => {
    try {
      trackEvent(eventName, params);
    } catch {
      // analytics must never break UI flow
    }
  };

  useEffect(() => {
    if (status !== 'CLOSED') return;

    const loadLeaderboard = async () => {
      setLeaderboardLoading(true);
      try {
        const res = await fetch(`/api/innovation/events/${eventId}/leaderboard`);
        const payload = (await res.json()) as { success: boolean; message: string; data: LeaderboardRow[] };
        if (!res.ok || !payload.success) throw new Error(payload.message || 'Failed to load leaderboard');
        setLeaderboard(payload.data);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Could not load leaderboard');
      } finally {
        setLeaderboardLoading(false);
      }
    };

    void loadLeaderboard();
  }, [eventId, status]);

  useEffect(() => {
    const memberCount = Math.max(teamSize - 1, 0);
    setMemberUids((prev) => {
      if (prev.length === memberCount) return prev;
      if (prev.length > memberCount) return prev.slice(0, memberCount);
      return [...prev, ...Array.from({ length: memberCount - prev.length }, () => '')];
    });
  }, [teamSize]);

  useEffect(() => {
    setVerifiedUidSnapshot('');
    setUidLookupRows([]);
    setUidLookupMessage('');
  }, [teamLeadUid, memberUids, teamSize, problemId]);

  const getNormalizedUidInputs = () => {
    const cleanedLeadUid = teamLeadUid.trim().toUpperCase();
    const cleanedMemberUids = memberUids.map((uid) => uid.trim().toUpperCase());
    const snapshot = JSON.stringify([cleanedLeadUid, ...cleanedMemberUids]);

    return {
      cleanedLeadUid,
      cleanedMemberUids,
      snapshot,
    };
  };

  useEffect(() => {
    if (!selectedProblem) return;

    const scrollY = window.scrollY;

    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";

    return () => {
      const y = document.body.style.top;

      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.width = "";

      if (y) {
        window.scrollTo(0, parseInt(y || "0") * -1);
      }
    };
  }, [selectedProblem]);

  const validateUidInputs = (cleanedLeadUid: string, cleanedMemberUids: string[]) => {
    if (!cleanedLeadUid || cleanedMemberUids.some((uid) => !uid)) {
      return 'Please fill all required UID fields.';
    }

    if (teamSize !== cleanedMemberUids.length + 1) {
      return 'Team size must match team lead plus member UID fields.';
    }

    if (new Set(cleanedMemberUids).size !== cleanedMemberUids.length) {
      return 'Member UIDs must be unique.';
    }

    if (cleanedMemberUids.includes(cleanedLeadUid)) {
      return 'Team lead UID cannot be repeated in member UID fields.';
    }

    return null;
  };

  const mapHackathonFailureReason = (message: string) => {
    if (message.includes('required UID fields')) return 'validation_required_uid_fields';
    if (message.includes('Team size')) return 'validation_team_size_mismatch';
    if (message.includes('unique')) return 'validation_duplicate_member_uid';
    if (message.includes('repeated')) return 'validation_repeated_team_lead_uid';
    if (message.includes('verify UID details')) return 'validation_uid_verification_required';
    if (message.includes('not eligible')) return 'validation_non_eligible_uid';
    if (message.includes('upload a PPT/PDF')) return 'validation_missing_presentation';
    return 'server_error';
  };

  const handleFetchUidDetails = async () => {
    setErrorMessage('');
    setStatusMessage('');
    setUidLookupMessage('');

    const { cleanedLeadUid, cleanedMemberUids, snapshot } = getNormalizedUidInputs();
    const validationError = validateUidInputs(cleanedLeadUid, cleanedMemberUids);
    if (validationError) {
      setErrorMessage(validationError);
      pushToast(validationError, "error");
      return;
    }

    const requestedUids = [cleanedLeadUid, ...cleanedMemberUids];

    setUidLookupBusy(true);
    try {
      const res = await fetch(
        `/api/innovation/users/lookup?uids=${encodeURIComponent(JSON.stringify(requestedUids))}&eventId=${eventId}&problemId=${problemId}`,
        {
          method: 'GET',
          credentials: 'include',
        }
      );

      const payload = (await res.json()) as {
        success: boolean;
        message: string;
        data: UidLookupRow[];
      };

      if (!res.ok || !payload.success) {
        throw new Error(payload.message || 'Failed to fetch UID details');
      }

      setUidLookupRows(payload.data);

      const hasIneligible = payload.data.some((row) => !row.eligible);
      if (hasIneligible) {
        setVerifiedUidSnapshot('');
        setUidLookupMessage('Some UIDs are non-eligible. Check the detailed reason below and update before submitting.');
        return;
      }

      setVerifiedUidSnapshot(snapshot);
      setUidLookupMessage('UID details fetched and verified. You can now submit registration.');
      pushToast("UIDs verified successfully!", "success");
    } catch (err) {
      setUidLookupRows([]);
      setVerifiedUidSnapshot('');
      const message = err instanceof Error ? err.message : 'Failed to fetch UID details';
      setErrorMessage(message);
      pushToast(message, "error");
    } finally {
      setUidLookupBusy(false);
    }
  };

  const registrationClosed = !registrationOpen || status === 'CLOSED' || new Date() > new Date(registrationCloseISO);
  const canShowRegistrationForm =
    viewerRole === 'STUDENT' &&
    !registrationClosed &&
    problems.length > 0 &&
    !registrationSummary;

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage('');
    setStatusMessage('');

    const { cleanedLeadUid, cleanedMemberUids, snapshot } = getNormalizedUidInputs();

    const validationError = validateUidInputs(cleanedLeadUid, cleanedMemberUids);
    if (validationError) {
      setErrorMessage(validationError);
      pushToast(validationError, "error");
      trackSafe('innovation_registration_failed', {
        track: 'hackathon',
        reason: mapHackathonFailureReason(validationError),
      });
      return;
    }

    if (verifiedUidSnapshot !== snapshot) {
      const msg = 'Please fetch and verify UID details first before submitting registration.';
      setErrorMessage(msg);
      pushToast(msg, "error");
      trackSafe('innovation_registration_failed', {
        track: 'hackathon',
        reason: mapHackathonFailureReason('Please fetch and verify UID details first before submitting registration.'),
      });
      return;
    }

    if (uidLookupRows.some((row) => !row.eligible)) {
      const msg = 'One or more UIDs are not eligible. Please correct them and fetch details again.';
      setErrorMessage(msg);
      pushToast(msg, "error");
      trackSafe('innovation_registration_failed', {
        track: 'hackathon',
        reason: mapHackathonFailureReason('One or more UIDs are not eligible. Please correct them and fetch details again.'),
      });
      return;
    }

    if (!pptFile) {
      const msg = 'Please upload a PPT/PDF file.';
      setErrorMessage(msg);
      pushToast(msg, "error");
      trackSafe('innovation_registration_failed', {
        track: 'hackathon',
        reason: mapHackathonFailureReason('Please upload a PPT/PDF file.'),
      });
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.set('teamName', teamName);
      formData.set('teamSize', String(teamSize));
      formData.set('teamLeadUid', cleanedLeadUid);
      formData.set('problemId', String(problemId));
      formData.set('memberUids', JSON.stringify(cleanedMemberUids));
      formData.set('pptFile', pptFile);

      const res = await fetch(`/api/innovation/events/${eventId}/register`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      const payload = (await res.json()) as {
        success: boolean;
        message: string;
        data?: {
          claimId?: number;
          registration?: ExistingRegistrationSummary;
        } | ExistingRegistrationSummary | null;
      };

      const dataObject = payload?.data ?? null;
      const registrationFromData =
        dataObject && typeof dataObject === 'object' && 'registration' in dataObject
          ? (dataObject.registration as ExistingRegistrationSummary | null)
          : (dataObject as ExistingRegistrationSummary | null);

      if (!res.ok || !payload.success) {
        if (registrationFromData?.claimId) {
          setRegistrationSummary(registrationFromData);
          setStatusMessage('You are already registered for this event. Team details are shown below.');
          setErrorMessage('');
          pushToast('Already registered for this event.', 'success');
          return;
        }

        throw new Error(payload.message || 'Registration failed');
      }

      if (registrationFromData?.claimId) {
        setRegistrationSummary(registrationFromData);
      }

      trackSafe('hackathon_register', {
        event_id: String(eventId),
        event_name: title,
        team_size: teamSize,
      });

      setStatusMessage('Team registered successfully. Your registration details are shown below.');
      pushToast("Team registered successfully!", "success");
      setTeamName('');
      setTeamSize(1);
      setTeamLeadUid('');
      setMemberUids([]);
      setPptFile(null);
      setUidLookupRows([]);
      setUidLookupMessage('');
      setVerifiedUidSnapshot('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setErrorMessage(message);
      pushToast(message, "error");
      trackSafe('innovation_registration_failed', {
        track: 'hackathon',
        reason: mapHackathonFailureReason(message),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {statusMessage ? <p className="mb-4 border border-green-300 bg-green-50 text-green-800 px-4 py-3 text-sm">{statusMessage}</p> : null}
      {errorMessage ? <p className="mb-4 border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm">{errorMessage}</p> : null}

      <section className="mb-6 flex flex-wrap gap-3">
        <Link
          href="/innovation"
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider ${pathname === "/innovation"
            ? "bg-[#002155] text-white"
            : "border border-[#002155] text-[#002155]"
            }`}
        >
          Innovation Home
        </Link>

        <Link
          href="/innovation/problems"
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider ${pathname === "/innovation/problems"
            ? "bg-[#0b6b2e] text-white"
            : "border border-[#0b6b2e] text-[#0b6b2e]"
            }`}
        >
          Open Problem Statements
        </Link>

        {viewerRole === "STUDENT" && (
          <Link
            href="/innovation/my-submissions"
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider ${pathname === "/innovation/my-submissions"
              ? "bg-[#8c4f00] text-white"
              : "border border-[#8c4f00] text-[#8c4f00]"
              }`}
          >
            My Submissions
          </Link>
        )}
      </section>

      <section className="mb-8 border border-[#c4c6d3] bg-white p-5">
        <p className="text-xs uppercase tracking-widest text-[#8c4f00]">{status}</p>
        <h2 className="text-2xl font-headline text-[#002155] mt-1">{title}</h2>
        {description ? <p className="mt-2 text-sm text-[#434651] whitespace-pre-wrap break-words">{renderTextWithClickableLinks(description)}</p> : null}
        <p className="mt-2 text-xs text-[#434651]">Starts: {new Date(startTimeISO).toLocaleString()}</p>
        <p className="mt-1 text-xs text-[#434651]">Ends: {new Date(endTimeISO).toLocaleString()}</p>
        <p className="mt-1 text-xs text-[#434651]">
          Submission lock: {submissionLockISO ? new Date(submissionLockISO).toLocaleString() : 'Not set'}
        </p>
        <p className="mt-1 text-xs text-[#434651]">Registration closes: {new Date(registrationCloseISO).toLocaleString()}</p>
        <p className="mt-1 text-xs text-[#434651]">Registration status: {registrationOpen ? 'OPEN' : 'CLOSED'}</p>
        {eventBriefUrl ? (
          <a href={eventBriefUrl} target="_blank" rel="noreferrer" className="inline-flex mt-3 text-xs font-bold uppercase tracking-wider text-[#8c4f00] underline">
            Open Event Brief (PPT/PDF)
          </a>
        ) : null}
      </section>

      <section className="mb-8">
        <h3 className="font-headline text-2xl text-[#002155] mb-4">Event Problems</h3>
        {problems.length === 0 ? (
          <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No problems linked to this event yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {problems.map((problem, index) => (
              <button
                key={problem.id}
                type="button"
                onClick={() => {
                  setSelectedProblem(problem);
                  setSelectedProblemIndex(index);
                }}
                className="border border-[#c4c6d3] bg-white p-4 text-left hover:border-[#002155] focus:outline-none focus:ring-2 focus:ring-[#002155]"
              >
                <p className="text-xs uppercase tracking-widest text-[#8c4f00]">PROBLEM STATEMENT {index + 1}</p>
                <p className="mt-1 text-sm font-bold text-[#002155]">{problem.title}</p>
                <p className="mt-1 text-xs text-[#434651]">
                  Type: {problem.isIndustryProblem ? `Industry${problem.industryName ? ` (${problem.industryName})` : ''}` : 'Normal'}
                </p>
                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-[#002155]">Click to view details</p>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedProblem ? (
        <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl border border-[#c4c6d3] bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-[#8c4f00]">
                  PROBLEM STATEMENT {selectedProblemIndex !== null ? selectedProblemIndex + 1 : ""}
                  {" "}of {problems.length}
                </p>
                <h4 className="mt-1 text-xl font-bold text-[#002155]">{selectedProblem.title}</h4>
                <p className="mt-1 text-xs text-[#434651]">
                  Type: {selectedProblem.isIndustryProblem ? `Industry${selectedProblem.industryName ? ` (${selectedProblem.industryName})` : ''}` : 'Normal'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedProblem(null);
                  setSelectedProblemIndex(null);
                }}
                className="border border-[#747782] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#434651]"
              >
                Close
              </button>
            </div>
            <p className="mt-4 text-sm text-[#434651] whitespace-pre-wrap break-words">{renderTextWithClickableLinks(selectedProblem.description)}</p>
          </div>
        </div>
      ) : null}

      {registrationSummary ? (
        <section className="mb-8 border border-[#0b6b2e] bg-[#f2fbf4] p-5">
          <p className="text-xs uppercase tracking-widest text-[#0b6b2e] font-bold">Already Registered</p>
          <h3 className="mt-1 font-headline text-2xl text-[#002155]">{registrationSummary.teamName}</h3>
          <p className="mt-2 text-sm text-[#434651]">
            Problem: <span className="font-semibold text-[#002155]">{registrationSummary.problem.title}</span>
          </p>
          <p className="mt-1 text-sm text-[#434651]">
            Team Leader:{' '}
            <span className="font-semibold text-[#002155]">
              {registrationSummary.teamLeader
                ? `${registrationSummary.teamLeader.name} (${registrationSummary.teamLeader.email})${registrationSummary.teamLeader.uid ? ` - UID: ${registrationSummary.teamLeader.uid}` : ''}`
                : 'Not available'}
            </span>
          </p>
          <p className="mt-1 text-xs text-[#434651]">Registered on: {new Date(registrationSummary.submittedAt).toLocaleString()}</p>

          <div className="mt-4">
            <p className="text-xs uppercase tracking-widest text-[#002155] font-bold mb-2">Team Members</p>
            <div className="space-y-2">
              {registrationSummary.members.map((member) => (
                <div key={`${registrationSummary.claimId}-${member.user.id}`} className="border border-[#c4c6d3] bg-white px-3 py-2 text-sm">
                  <p className="font-semibold text-[#002155]">
                    {member.user.name} ({member.user.email})
                  </p>
                  <p className="text-xs text-[#434651]">
                    Role: {member.role}
                    {member.user.uid ? ` | UID: ${member.user.uid}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {registrationSummary.submissionFileUrl ? (
            <a
              href={registrationSummary.submissionFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex mt-4 text-xs font-bold uppercase tracking-wider text-[#002155] underline"
            >
              Open Uploaded PPT/PDF
            </a>
          ) : (
            <p className="mt-4 text-xs text-[#8c4f00]">PPT/PDF link is currently unavailable.</p>
          )}
        </section>
      ) : null}

      {canShowRegistrationForm ? (
        <section id="register-team" className="mb-8 border border-[#c4c6d3] bg-white p-5">
          <h3 className="font-headline text-2xl text-[#002155] mb-4">Register Team</h3>
          <p className="mb-3 text-xs text-[#434651]">UID format: STARTYEAR-BRANCHDIVISIONROLLNO-ENDYEAR (example: 24-COMPD13-28). Enter valid UIDs for all team members. First fetch user details to verify the team, then submit registration.</p>
          <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={handleRegister}>
            <input className="border border-[#747782] p-3 text-sm" placeholder="Team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} required />
            <input
              type="number"
              min={1}
              max={10}
              className="border border-[#747782] p-3 text-sm"
              placeholder="Total team size (including lead)"
              value={teamSize}
              onChange={(e) => setTeamSize(Math.max(1, Number(e.target.value) || 1))}
              required
            />
            <select className="border border-[#747782] p-3 text-sm" value={problemId} onChange={(e) => setProblemId(Number(e.target.value))} required>
              {problems.map((problem) => (
                <option key={problem.id} value={problem.id}>
                  {problem.title}
                </option>
              ))}
            </select>
            <input
              className="border border-[#747782] p-3 text-sm"
              placeholder="Team lead UID (e.g. 24-COMPD13-28)"
              value={teamLeadUid}
              onChange={(e) => setTeamLeadUid(e.target.value)}
              required
            />
            {memberUids.map((uid, index) => (
              <input
                key={index}
                className="border border-[#747782] p-3 text-sm md:col-span-2"
                placeholder={`Member ${index + 1} UID (e.g. 24-COMPD13-28)`}
                value={uid}
                onChange={(e) =>
                  setMemberUids((prev) => {
                    const next = [...prev];
                    next[index] = e.target.value;
                    return next;
                  })
                }
                required
              />
            ))}
            <button
              type="button"
              onClick={() => void handleFetchUidDetails()}
              disabled={uidLookupBusy || busy}
              className="border border-[#002155] text-[#002155] px-4 py-3 text-xs font-bold uppercase tracking-wider md:w-fit disabled:opacity-60"
            >
              {uidLookupBusy ? 'Fetching UID Details...' : 'Fetch UID Details'}
            </button>
            {uidLookupMessage ? (
              <p className={`md:col-span-2 text-xs ${verifiedUidSnapshot ? 'text-green-700' : 'text-[#8c4f00]'}`}>{uidLookupMessage}</p>
            ) : null}
            {uidLookupRows.length > 0 ? (
              <div className="md:col-span-2 border border-[#e3e2df] bg-[#faf9f5] p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-[#002155]">UID Verification Results</p>
                <ul className="mt-2 space-y-2">
                  {uidLookupRows.map((row) => (
                    <li key={row.uid} className="text-xs text-[#434651]">
                      <span className="font-bold text-[#002155]">{row.uid}</span>: {row.found ? `${row.name || 'Unknown'} (${row.email || 'No email'})` : 'Not found'}
                      {row.found ? ` | ${row.role} | ${row.status} | ${row.isVerified ? 'Verified' : 'Not verified'}` : ''}
                      {' | '}
                      <span className={row.eligible ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>
                        {row.eligible ? 'Eligible' : 'Non-eligible'}
                      </span>
                      {` | ${row.reason}`}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="md:col-span-2 border-2 border-dashed border-[#0b6b2e] bg-[#f2fbf4] p-4">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#0b6b2e] mb-1">Required Upload: Team Presentation</label>
              <p className="mb-2 text-xs text-[#434651]">Upload PPT/PPTX (or PDF if your deck is exported).</p>
              <input
                type="file"
                accept=".ppt,.pptx,.pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf"
                onChange={(e) => setPptFile(e.target.files?.[0] ?? null)}
                className="w-full"
                required
              />
              <p className="mt-2 text-[11px] text-[#434651]">{pptFile ? `Selected: ${pptFile.name}` : 'No file selected yet.'}</p>
            </div>
            <button type="submit" disabled={busy || uidLookupBusy} className="bg-[#002155] text-white px-4 py-3 text-xs font-bold uppercase tracking-wider md:w-fit disabled:opacity-70">
              {busy ? 'Submitting...' : 'Register Team'}
            </button>
          </form>
        </section>
      ) : null}

      {!canShowRegistrationForm && !registrationSummary ? (
        <p className="mb-8 border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">
          {viewerRole === null
            ? 'Login as a student to register for this event.'
            : viewerRole !== 'STUDENT'
              ? 'Only student accounts can register for this event.'
              : !registrationOpen
                ? 'Event registration is currently closed by faculty/admin.'
                : registrationClosed
                  ? 'Event registration is closed.'
                  : 'Registration will open once event problems are available.'}
          {viewerRole === null ? (
            <Link href={`/login?next=${encodeURIComponent(`/innovation/events/${eventId}`)}`} className="ml-2 text-[#002155] font-bold underline uppercase text-xs tracking-wider">
              Go to Login
            </Link>
          ) : null}
        </p>
      ) : null}

      {status === 'CLOSED' ? (
        <section>
          <h3 className="font-headline text-2xl text-[#002155] mb-4">Leaderboard</h3>
          {leaderboardLoading ? (
            <p className="text-sm text-[#434651]">Loading leaderboard...</p>
          ) : leaderboard.length === 0 ? (
            <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No scored submissions yet.</p>
          ) : (
            <div className="overflow-x-auto border border-[#c4c6d3] bg-white">
              <table className="w-full text-sm">
                <thead className="bg-[#f5f4f0] text-[#434651] uppercase text-xs tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-3">Rank</th>
                    <th className="text-left px-4 py-3">Team</th>
                    <th className="text-left px-4 py-3">Final Score</th>
                    <th className="text-left px-4 py-3">Members</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row) => (
                    <tr key={`${row.rank}-${row.teamName}`} className="border-t border-[#e3e2df]">
                      <td className="px-4 py-3">#{row.rank}</td>
                      <td className="px-4 py-3">{row.teamName}</td>
                      <td className="px-4 py-3">{row.score}</td>
                      <td className="px-4 py-3">{row.members.map((member) => member.name).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
