"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';

type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
};

type ClaimRow = {
  id: number;
  teamName: string | null;
  status: string;
  submissionUrl: string | null;
  submissionFileUrl: string | null;
  score: number | null;
  feedback: string | null;
  badges: string | null;
  updatedAt: string;
  problem: {
    id: number;
    title: string;
    mode: string;
    status: string;
    event: { id: number; title: string; status: string } | null;
  };
};

async function fetchClaims(): Promise<ClaimRow[]> {
  const res = await fetch('/api/innovation/claims/my', {
    credentials: 'include',
  });

  const payload = (await res.json()) as ApiEnvelope<ClaimRow[]>;
  if (!res.ok || !payload.success) throw new Error(payload.message || 'Failed to fetch claims');
  return payload.data;
}

export default function MySubmissionsClient() {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [claims, setClaims] = useState<ClaimRow[]>([]);

  useEffect(() => {
    const run = async () => {
      try {
        const data = await fetchClaims();
        setClaims(data);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Could not load submissions');
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          My Innovation Submissions
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body">
          Track your claim status, uploaded links/files, scores, and faculty feedback.
        </p>
      </header>

      <section className="mb-6 flex flex-wrap gap-3">
        <Link href="/innovation" className="bg-[#002155] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider">
          Innovation Home
        </Link>
        <Link href="/innovation/problems" className="border border-[#002155] text-[#002155] px-4 py-2 text-xs font-bold uppercase tracking-wider">
          Browse Problems
        </Link>
      </section>

      {loading ? <p className="text-sm text-[#434651]">Loading your submissions...</p> : null}
      {errorMessage ? <p className="mb-4 border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm">{errorMessage}</p> : null}

      {!loading && !errorMessage ? (
        claims.length === 0 ? (
          <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No claims found for your account.</p>
        ) : (
          <div className="space-y-4">
            {claims.map((claim) => (
              <article key={claim.id} className="border border-[#c4c6d3] bg-white p-5">
                <p className="text-xs uppercase tracking-widest text-[#8c4f00]">{claim.status}</p>
                <h2 className="mt-1 text-lg font-bold text-[#002155]">{claim.problem.title}</h2>
                <p className="mt-2 text-sm text-[#434651]">Team: {claim.teamName || 'Individual'}</p>
                <p className="mt-1 text-xs text-[#434651]">Score: {claim.score ?? 'Pending'}</p>
                <p className="mt-1 text-xs text-[#434651]">Badges: {claim.badges || 'None'}</p>
                <p className="mt-1 text-xs text-[#434651]">Last update: {new Date(claim.updatedAt).toLocaleString()}</p>
                {claim.problem.event ? <p className="mt-1 text-xs text-[#434651]">Event: {claim.problem.event.title}</p> : null}

                {claim.problem.event ? (
                  <Link
                    href={`/innovation/events/${claim.problem.event.id}`}
                    className="inline-flex mt-3 border border-[#002155] text-[#002155] px-3 py-2 text-xs font-bold uppercase tracking-wider"
                  >
                    View Event Page
                  </Link>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-3">
                  {claim.submissionUrl ? (
                    <a href={claim.submissionUrl} target="_blank" rel="noreferrer" className="text-xs font-bold uppercase tracking-wider text-[#8c4f00] underline">
                      Open Submission URL
                    </a>
                  ) : null}
                  {claim.submissionFileUrl ? (
                    <a href={claim.submissionFileUrl} target="_blank" rel="noreferrer" className="text-xs font-bold uppercase tracking-wider text-[#8c4f00] underline">
                      Open Uploaded File
                    </a>
                  ) : null}
                </div>

                {claim.feedback ? (
                  <div className="mt-3 border border-[#e3e2df] bg-[#faf9f5] p-3">
                    <p className="text-xs uppercase tracking-widest text-[#434651] font-bold">Faculty Feedback</p>
                    <p className="mt-1 text-sm text-[#434651]">{claim.feedback}</p>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )
      ) : null}
    </main>
  );
}
