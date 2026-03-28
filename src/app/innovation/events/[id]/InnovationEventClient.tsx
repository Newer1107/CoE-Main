"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import CountdownTimer from '@/components/CountdownTimer';

type ProblemLite = {
  id: number;
  title: string;
  description: string;
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

type InnovationEventClientProps = {
  eventId: number;
  title: string;
  description: string | null;
  status: 'UPCOMING' | 'ACTIVE' | 'JUDGING' | 'CLOSED';
  registrationOpen: boolean;
  startTimeISO: string;
  endTimeISO: string;
  registrationCloseISO: string;
  eventBriefUrl: string | null;
  problems: ProblemLite[];
  viewerRole: 'STUDENT' | 'FACULTY' | 'ADMIN' | null;
};

export default function InnovationEventClient({
  eventId,
  title,
  description,
  status,
  registrationOpen,
  startTimeISO,
  endTimeISO,
  registrationCloseISO,
  eventBriefUrl,
  problems,
  viewerRole,
}: InnovationEventClientProps) {
  const [selectedProblem, setSelectedProblem] = useState<ProblemLite | null>(null);
  const [teamName, setTeamName] = useState('');
  const [teamSize, setTeamSize] = useState(1);
  const [teamLeadUid, setTeamLeadUid] = useState('');
  const [memberUids, setMemberUids] = useState<string[]>([]);
  const [problemId, setProblemId] = useState<number>(problems[0]?.id ?? 0);
  const [pptFile, setPptFile] = useState<File | null>(null);

  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  useEffect(() => {
    if (!['JUDGING', 'CLOSED'].includes(status)) return;

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

  const registrationClosed = !registrationOpen || status === 'CLOSED' || new Date() > new Date(registrationCloseISO);
  const canShowRegistrationForm = viewerRole === 'STUDENT' && !registrationClosed && problems.length > 0;

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage('');
    setStatusMessage('');

    const cleanedLeadUid = teamLeadUid.trim().toUpperCase();
    const cleanedMemberUids = memberUids.map((uid) => uid.trim().toUpperCase());

    if (!cleanedLeadUid || cleanedMemberUids.some((uid) => !uid)) {
      setErrorMessage('Please fill all required UID fields.');
      return;
    }

    if (teamSize !== cleanedMemberUids.length + 1) {
      setErrorMessage('Team size must match team lead plus member UID fields.');
      return;
    }

    if (new Set(cleanedMemberUids).size !== cleanedMemberUids.length) {
      setErrorMessage('Member UIDs must be unique.');
      return;
    }

    if (cleanedMemberUids.includes(cleanedLeadUid)) {
      setErrorMessage('Team lead UID cannot be repeated in member UID fields.');
      return;
    }

    if (!pptFile) {
      setErrorMessage('Please upload a PPT/PDF file.');
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

      const payload = (await res.json()) as { success: boolean; message: string };
      if (!res.ok || !payload.success) throw new Error(payload.message || 'Registration failed');

      setStatusMessage('Team registered successfully.');
      setTeamName('');
      setTeamSize(1);
      setTeamLeadUid('');
      setMemberUids([]);
      setPptFile(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {statusMessage ? <p className="mb-4 border border-green-300 bg-green-50 text-green-800 px-4 py-3 text-sm">{statusMessage}</p> : null}
      {errorMessage ? <p className="mb-4 border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm">{errorMessage}</p> : null}

      <section className="mb-6 flex flex-wrap gap-3">
        <Link href="/innovation" className="bg-[#002155] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider">
          Innovation Home
        </Link>
        <Link href="/innovation/my-submissions" className="border border-[#8c4f00] text-[#8c4f00] px-4 py-2 text-xs font-bold uppercase tracking-wider">
          My Submissions
        </Link>
      </section>

      <section className="mb-8 border border-[#c4c6d3] bg-white p-5">
        <p className="text-xs uppercase tracking-widest text-[#8c4f00]">{status}</p>
        <h2 className="text-2xl font-headline text-[#002155] mt-1">{title}</h2>
        {description ? <p className="mt-2 text-sm text-[#434651]">{description}</p> : null}
        <p className="mt-2 text-xs text-[#434651]">Starts: {new Date(startTimeISO).toLocaleString()}</p>
        <p className="mt-1 text-xs text-[#434651]">Ends: {new Date(endTimeISO).toLocaleString()}</p>
        <p className="mt-1 text-xs text-[#434651]">Registration closes: {new Date(registrationCloseISO).toLocaleString()}</p>
        <p className="mt-1 text-xs text-[#434651]">Registration status: {registrationOpen ? 'OPEN' : 'CLOSED'}</p>
        {eventBriefUrl ? (
          <a href={eventBriefUrl} target="_blank" rel="noreferrer" className="inline-flex mt-3 text-xs font-bold uppercase tracking-wider text-[#8c4f00] underline">
            Open Event Brief (PPT/PDF)
          </a>
        ) : null}
        {status === 'ACTIVE' ? (
          <CountdownTimer targetISO={endTimeISO} prefix="Submission lock" className="mt-2 text-xs font-bold uppercase tracking-wider text-[#002155]" />
        ) : null}
      </section>

      <section className="mb-8">
        <h3 className="font-headline text-2xl text-[#002155] mb-4">Event Problems</h3>
        {problems.length === 0 ? (
          <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No problems linked to this event yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {problems.map((problem) => (
              <button
                key={problem.id}
                type="button"
                onClick={() => setSelectedProblem(problem)}
                className="border border-[#c4c6d3] bg-white p-4 text-left hover:border-[#002155] focus:outline-none focus:ring-2 focus:ring-[#002155]"
              >
                <p className="text-xs uppercase tracking-widest text-[#8c4f00]">{problem.mode}</p>
                <p className="mt-1 text-sm font-bold text-[#002155]">{problem.title}</p>
                <p className="mt-2 text-xs text-[#434651]">Status: {problem.status}</p>
                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-[#002155]">Click to view details</p>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedProblem ? (
        <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl border border-[#c4c6d3] bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-[#8c4f00]">Problem Statement</p>
                <h4 className="mt-1 text-xl font-bold text-[#002155]">{selectedProblem.title}</h4>
                <p className="mt-1 text-xs text-[#434651]">{selectedProblem.mode} • {selectedProblem.status}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProblem(null)}
                className="border border-[#747782] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#434651]"
              >
                Close
              </button>
            </div>
            <p className="mt-4 text-sm text-[#434651] whitespace-pre-wrap">{selectedProblem.description}</p>
          </div>
        </div>
      ) : null}

      {canShowRegistrationForm ? (
        <section id="register-team" className="mb-8 border border-[#c4c6d3] bg-white p-5">
          <h3 className="font-headline text-2xl text-[#002155] mb-4">Register Team</h3>
          <p className="mb-3 text-xs text-[#434651]">Enter valid UIDs for all team members. If any UID is not registered, the request will be rejected and that user must register first.</p>
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
              placeholder="Team lead UID"
              value={teamLeadUid}
              onChange={(e) => setTeamLeadUid(e.target.value)}
              required
            />
            {memberUids.map((uid, index) => (
              <input
                key={index}
                className="border border-[#747782] p-3 text-sm md:col-span-2"
                placeholder={`Member ${index + 1} UID`}
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
            <input
              type="file"
              accept=".ppt,.pptx,.pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf"
              onChange={(e) => setPptFile(e.target.files?.[0] ?? null)}
              className="md:col-span-2"
              required
            />
            <button type="submit" disabled={busy} className="bg-[#002155] text-white px-4 py-3 text-xs font-bold uppercase tracking-wider md:w-fit">
              {busy ? 'Submitting...' : 'Register Team'}
            </button>
          </form>
        </section>
      ) : null}

      {!canShowRegistrationForm ? (
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

      {['JUDGING', 'CLOSED'].includes(status) ? (
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
