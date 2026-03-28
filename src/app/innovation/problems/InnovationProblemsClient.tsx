"use client";

import { useEffect, useMemo, useState } from 'react';

type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
  errors?: string[];
};

type ProblemRow = {
  id: number;
  title: string;
  description: string;
  tags: string | null;
  mode: 'OPEN' | 'CLOSED';
  status: 'UNCLAIMED' | 'CLAIMED' | 'SOLVED' | 'ARCHIVED';
  createdById: number;
  createdBy: { id: number; name: string; email: string };
  _count: { claims: number };
};

type InnovationProblemsClientProps = {
  role: 'STUDENT' | 'FACULTY' | 'ADMIN';
  userId: number;
};

const parseUids = (value: string): string[] => {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((v) => v.trim().toUpperCase())
        .filter((v) => v.length > 0)
    )
  );
};

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  const payload = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || !payload.success) throw new Error(payload.message || 'Request failed');
  return payload.data;
}

export default function InnovationProblemsClient({ role, userId }: InnovationProblemsClientProps) {
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [problems, setProblems] = useState<ProblemRow[]>([]);

  const [tagFilter, setTagFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newTags, setNewTags] = useState('');

  const [claimForms, setClaimForms] = useState<Record<number, { teamName: string; memberCsv: string }>>({});

  const loadProblems = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const params = new URLSearchParams();
      if (tagFilter.trim()) params.set('tag', tagFilter.trim());
      if (statusFilter.trim()) params.set('status', statusFilter.trim());

      const query = params.toString();
      const data = await fetchJson<ProblemRow[]>(`/api/innovation/problems${query ? `?${query}` : ''}`);
      setProblems(data);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load problems');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProblems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ownProblems = useMemo(() => problems.filter((p) => p.createdById === userId), [problems, userId]);

  const runAction = async (action: () => Promise<void>, success: string) => {
    setErrorMessage('');
    setStatusMessage('');
    setLoading(true);
    try {
      await action();
      setStatusMessage(success);
      await loadProblems();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  const submitCreateProblem = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      await fetchJson('/api/innovation/problems', {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle,
          description: newDescription,
          tags: newTags,
          mode: 'OPEN',
        }),
      });
      setNewTitle('');
      setNewDescription('');
      setNewTags('');
    }, 'Problem created successfully.');
  };

  const submitClaim = async (problemId: number, event: React.FormEvent) => {
    event.preventDefault();
    const form = claimForms[problemId] || { teamName: '', memberCsv: '' };

    await runAction(async () => {
      await fetchJson('/api/innovation/claims', {
        method: 'POST',
        body: JSON.stringify({
          problemId,
          teamName: form.teamName,
          memberUids: parseUids(form.memberCsv),
        }),
      });
      setClaimForms((prev) => ({
        ...prev,
        [problemId]: { teamName: '', memberCsv: '' },
      }));
    }, 'Problem claimed successfully.');
  };

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          Innovation Problems
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body">
          Browse problem statements, submit claims, and track participation across continuous innovation tracks.
        </p>
      </header>

      {statusMessage ? <p className="mb-4 border border-green-300 bg-green-50 text-green-800 px-4 py-3 text-sm">{statusMessage}</p> : null}
      {errorMessage ? <p className="mb-4 border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm">{errorMessage}</p> : null}

      <section className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <input
          className="w-full border border-[#747782] p-3 text-sm"
          placeholder="Filter by tag"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
        />
        <select className="w-full border border-[#747782] p-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="UNCLAIMED">UNCLAIMED</option>
          <option value="CLAIMED">CLAIMED</option>
          <option value="SOLVED">SOLVED</option>
          <option value="ARCHIVED">ARCHIVED</option>
        </select>
        <button
          onClick={() => void loadProblems()}
          className="bg-[#002155] text-white px-4 py-3 text-xs font-bold uppercase tracking-wider"
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Apply Filters'}
        </button>
      </section>

      {(role === 'FACULTY' || role === 'ADMIN') && (
        <section className="mb-10 border border-[#c4c6d3] bg-white p-5">
          <h2 className="font-headline text-2xl text-[#002155] mb-4">Create Problem</h2>
          <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={submitCreateProblem}>
            <input className="border border-[#747782] p-3 text-sm" placeholder="Title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required />
            <div className="border border-[#e3e2df] bg-[#faf9f5] p-3 text-xs text-[#434651] flex items-center">Creates OPEN innovation problem</div>
            <input className="border border-[#747782] p-3 text-sm md:col-span-2" placeholder="Tags (comma-separated)" value={newTags} onChange={(e) => setNewTags(e.target.value)} />
            <textarea
              className="border border-[#747782] p-3 text-sm min-h-[120px] md:col-span-2"
              placeholder="Description"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              required
            />
            <button type="submit" className="bg-[#002155] text-white px-4 py-3 text-xs font-bold uppercase tracking-wider md:w-fit" disabled={loading}>
              Create Problem
            </button>
          </form>

          <div className="mt-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#434651] mb-3">My Problems</h3>
            {ownProblems.length === 0 ? (
              <p className="text-sm text-[#434651]">No authored problems yet.</p>
            ) : (
              <div className="space-y-3">
                {ownProblems.map((problem) => (
                  <article key={problem.id} className="border border-[#e3e2df] p-3 bg-[#faf9f5]">
                    <p className="text-sm font-bold text-[#002155]">{problem.title}</p>
                    <p className="text-xs text-[#434651] mt-1">{problem.mode} • {problem.status} • Claims {problem._count.claims}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-headline text-2xl text-[#002155] mb-4">Problem Board</h2>
        {problems.length === 0 ? (
          <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No problems found for current filters.</p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {problems.map((problem) => {
              const form = claimForms[problem.id] || { teamName: '', memberCsv: '' };
              return (
                <article key={problem.id} className="border border-[#c4c6d3] bg-white p-5">
                  <p className="text-xs uppercase tracking-widest text-[#8c4f00]">{problem.mode}</p>
                  <h3 className="mt-1 text-lg font-bold text-[#002155]">{problem.title}</h3>
                  <p className="mt-2 text-sm text-[#434651] line-clamp-4">{problem.description}</p>
                  <p className="mt-2 text-xs text-[#434651]">Status: {problem.status}</p>
                  <p className="mt-1 text-xs text-[#434651]">Tags: {problem.tags || 'None'}</p>
                  <p className="mt-1 text-xs text-[#434651]">Claims: {problem._count.claims}</p>

                  {role === 'STUDENT' && problem.status !== 'ARCHIVED' ? (
                    <form className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={(event) => void submitClaim(problem.id, event)}>
                      <input
                        className="border border-[#747782] p-2 text-xs"
                        placeholder="Team name (optional)"
                        value={form.teamName}
                        onChange={(event) =>
                          setClaimForms((prev) => ({
                            ...prev,
                            [problem.id]: { ...form, teamName: event.target.value },
                          }))
                        }
                      />
                      <input
                        className="border border-[#747782] p-2 text-xs"
                        placeholder="Member UIDs comma-separated"
                        value={form.memberCsv}
                        onChange={(event) =>
                          setClaimForms((prev) => ({
                            ...prev,
                            [problem.id]: { ...form, memberCsv: event.target.value },
                          }))
                        }
                      />
                      <button type="submit" className="bg-[#002155] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider md:w-fit" disabled={loading}>
                        Claim Problem
                      </button>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
