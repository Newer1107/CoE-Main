"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

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
  isIndustryProblem: boolean;
  industryName: string | null;
  supportDocumentUrl?: string | null;
  mode: 'OPEN' | 'CLOSED';
  status: 'OPENED' | 'CLOSED' | 'ARCHIVED';
  createdById: number;
  createdBy: { id: number; name: string; email: string };
  _count: { claims: number; applications: number };
};

type InnovationFacultyClientProps = {
  role: 'FACULTY' | 'ADMIN';
  userId: number;
};

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
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [problems, setProblems] = useState<ProblemRow[]>([]);

  const loadProblems = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await fetchJson<ProblemRow[]>('/api/innovation/problems?track=open');
      setProblems(data);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load problems');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProblems();
  }, []);

  const ownProblems = useMemo(() => {
    if (role === 'ADMIN') return problems;
    return problems.filter((problem) => problem.createdById === userId);
  }, [problems, role, userId]);

  const runAction = async (action: () => Promise<void>, successText: string) => {
    setLoading(true);
    setErrorMessage('');
    setStatusMessage('');

    try {
      await action();
      setStatusMessage(successText);
      await loadProblems();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  const setOpenProblemStatus = async (problemId: number, status: 'OPENED' | 'CLOSED') => {
    await runAction(async () => {
      await fetchJson(`/api/innovation/problems/${problemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    }, status === 'CLOSED' ? 'Problem closed.' : 'Problem reopened.');
  };

  const archiveProblem = async (problemId: number) => {
    await runAction(async () => {
      await fetchJson(`/api/innovation/problems/${problemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ARCHIVED' }),
      });
    }, 'Problem archived.');
  };

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          Faculty Workspace
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body text-sm">
          Manage open problem statements with the new application workflow.
        </p>
      </header>

      {statusMessage ? (
        <p className="mb-4 border border-green-300 bg-green-50 text-green-800 px-4 py-3 text-sm rounded">{statusMessage}</p>
      ) : null}
      {errorMessage ? (
        <p className="mb-4 border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm rounded">{errorMessage}</p>
      ) : null}

      <section className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/innovation/faculty/problems/create"
          className="border border-[#fd9923] bg-[#fff9f0] p-4 rounded hover:bg-[#ffe6c0] transition-colors"
        >
          <p className="text-xs font-bold uppercase tracking-wider text-[#fd9923]">+ Create New Problem</p>
          <p className="text-sm text-[#434651] mt-2">Use the new creation page with custom questions and support document upload.</p>
        </Link>
        <Link
          href="/innovation/faculty/applications"
          className="border border-[#0b6b2e] bg-[#f0fdf4] p-4 rounded hover:bg-[#dcfce7] transition-colors"
        >
          <p className="text-xs font-bold uppercase tracking-wider text-[#0b6b2e]">Review Applications</p>
          <p className="text-sm text-[#434651] mt-2">Review student applications in the new dashboard.</p>
        </Link>
      </section>

      <section className="border border-[#c4c6d3] bg-white p-5 md:p-6 rounded">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-headline text-2xl text-[#002155]">Open Problem Statements</h2>
          <button
            onClick={() => void loadProblems()}
            disabled={loading}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider border border-[#002155] text-[#002155] hover:bg-[#f5f4f0] disabled:opacity-60"
          >
            Refresh
          </button>
        </div>

        {ownProblems.length === 0 ? (
          <p className="text-sm text-[#434651] border border-dashed border-[#c4c6d3] p-6 rounded">
            No open problems found.
          </p>
        ) : (
          <div className="space-y-3">
            {ownProblems.map((problem) => (
              <article key={problem.id} className="border border-[#e3e2df] bg-white p-4 rounded">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[#002155]">{problem.title}</p>
                    <p className="mt-1 text-xs text-[#434651]">
                      {problem.mode} • {problem.status} • Applications: {problem._count.applications}
                    </p>
                    <p className="mt-1 text-xs text-[#434651]">
                      Type: {problem.isIndustryProblem ? `Industry${problem.industryName ? ` (${problem.industryName})` : ''}` : 'Normal'}
                    </p>
                    {problem.tags ? <p className="mt-1 text-xs text-[#434651]">Tags: {problem.tags}</p> : null}
                    {problem.supportDocumentUrl ? (
                      <a
                        href={problem.supportDocumentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex mt-2 text-xs font-bold uppercase tracking-wider text-[#8c4f00] underline"
                      >
                        Open Support Document
                      </a>
                    ) : null}
                  </div>
                </div>

                {problem.status !== 'ARCHIVED' ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {problem.status === 'CLOSED' ? (
                      <button
                        onClick={() => void setOpenProblemStatus(problem.id, 'OPENED')}
                        className="border border-[#0b6b2e] text-[#0b6b2e] px-3 py-2 text-xs font-bold uppercase tracking-wider"
                      >
                        Reopen
                      </button>
                    ) : (
                      <button
                        onClick={() => void setOpenProblemStatus(problem.id, 'CLOSED')}
                        className="border border-[#8c4f00] text-[#8c4f00] px-3 py-2 text-xs font-bold uppercase tracking-wider"
                      >
                        Close
                      </button>
                    )}
                    <button
                      onClick={() => void archiveProblem(problem.id)}
                      className="border border-[#ba1a1a] text-[#ba1a1a] px-3 py-2 text-xs font-bold uppercase tracking-wider"
                    >
                      Archive
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
