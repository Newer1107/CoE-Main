"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ApplyModal from '@/components/ApplyModal';
import { useToast } from "@/components/ToastProvider";
import { usePathname } from "next/navigation";
import Link from 'next/link';

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
  isIndustryProblem: boolean;
  industryName: string | null;
  supportDocumentUrl: string | null;
  mode: 'OPEN' | 'CLOSED';
  status: 'OPENED' | 'CLOSED' | 'ARCHIVED';
  createdById: number;
  createdBy: { id: number; name: string; email: string };
  _count: { claims: number; applications: number };
};

type InnovationProblemsClientProps = {
  role: 'STUDENT' | 'FACULTY' | 'ADMIN' | null;
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

export default function InnovationProblemsClient({ role }: InnovationProblemsClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [problems, setProblems] = useState<ProblemRow[]>([]);
  const [tagFilter, setTagFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const { pushToast } = useToast();
  const pathname = usePathname();

  // Apply modal state
  const [applyingProblem, setApplyingProblem] = useState<ProblemRow | null>(null);
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [userApplications, setUserApplications] = useState<Set<number>>(new Set());
  const [profile, setProfile] = useState<{ isComplete: boolean } | null>(null);

  // Fetch profile and user applications
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        if (role === 'STUDENT') {
          // Fetch profile
          const profileRes = await fetch('/api/profile');
          if (profileRes.ok) {
            const data = await profileRes.json();
            setProfile(data.data);
          }

          // Fetch user's existing applications
          const appsRes = await fetch('/api/innovation/applications/my');
          if (appsRes.ok) {
            const data = await appsRes.json();
            setUserApplications(new Set(data.data?.map((app: any) => app.problemId) || []));
          }
        }
      } catch (err) {
        console.error('Error fetching user data:', err);
      }
    };

    fetchUserData();
  }, [role]);

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
    loadProblems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyClick = (problem: ProblemRow) => {
    if (!role) {
      pushToast("You need to log in before applying.", "info");

      const currentPath = typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : '/innovation/problems';

      const searchParams = new URLSearchParams({
        next: currentPath,
        reason: 'problem-apply-auth-required',
      });

      setTimeout(() => {
        window.location.href = `/login?${searchParams.toString()}`;
      }, 1200);

      return;
    }

    if (role !== 'STUDENT') {
      return; // Only students can apply
    }

    // Check if profile is complete
    if (!profile?.isComplete) {
      router.push('/profile?reason=complete-profile-to-apply');
      return;
    }

    // Open apply modal
    setApplyingProblem(problem);
    setIsApplyModalOpen(true);
  };

  const handleApplySuccess = () => {
    setIsApplyModalOpen(false);
    setApplyingProblem(null);
    // Update user applications set
    if (applyingProblem) {
      setUserApplications((prev) => new Set([...prev, applyingProblem.id]));
    }
    // Reload problems to update counts
    loadProblems();
  };

  return (
    <main className="max-w-7xl mx-auto mt-10 px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      {/* Header */}
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          Open Problems
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body text-sm">
          Apply for real-world industry problems and showcase your skills
        </p>
      </header>

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

        {role === "STUDENT" && (
          <Link
            href="/innovation/my-submissions"
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider ${pathname === "/innovation/my-submissions"
                ? "bg-[#002155] text-white"
                : "border border-[#002155] text-[#002155]"
              }`}
          >
            My Submissions
          </Link>
        )}

        {role === "FACULTY" && (
          <Link
            href="/innovation/faculty"
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider ${pathname === "/innovation/faculty"
                ? "bg-[#8c4f00] text-white"
                : "border border-[#8c4f00] text-[#8c4f00]"
              }`}
          >
            Faculty Workspace
          </Link>
        )}
      </section>

      {/* Filters */}
      <section className="mb-8 flex flex-col md:flex-row gap-4">
        <input
          type="text"
          placeholder="Filter by tag..."
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="flex-1 px-4 py-2 border border-[#c4c6d3] rounded text-sm focus:outline-none focus:border-[#fd9923] focus:ring-1 focus:ring-[#fd9923]/50"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-[#c4c6d3] rounded text-sm focus:outline-none focus:border-[#fd9923]"
        >
          <option value="">All Statuses</option>
          <option value="OPENED">Open</option>
          <option value="CLOSED">Closed</option>
        </select>
        <button
          onClick={() => loadProblems()}
          className="px-6 py-2 bg-[#002155] text-white rounded font-medium hover:bg-[#003380] transition-colors text-sm"
        >
          Apply Filters
        </button>
      </section>

      {/* Error Message */}
      {errorMessage && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-800 text-sm rounded">
          <p>{errorMessage}</p>
        </div>
      )}

      {/* Profile Incomplete Warning (for students) */}
      {role === 'STUDENT' && !profile?.isComplete && (
        <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded">
          <p className="text-yellow-800 font-medium text-sm">
            ⚠️ Please <a href="/profile" className="underline font-bold">complete your profile</a> before applying for problems.
          </p>
        </div>
      )}

      {/* Problems Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline text-2xl text-[#002155]">Problem Board</h2>
          {loading && <span className="text-xs text-[#747782]">Loading...</span>}
        </div>

        {problems.length === 0 ? (
          <div className="border border-dashed border-[#c4c6d3] bg-white p-8 text-center rounded">
            <p className="text-[#434651]">
              {tagFilter || statusFilter ? 'No problems found for current filters.' : 'No open problems available at the moment.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {problems.map((problem) => {
              const isOpen = problem.status === 'OPENED' && problem.mode === 'OPEN';
              const isAlreadyApplied = userApplications.has(problem.id);

              return (
                <article
                  key={problem.id}
                  className="border border-[#c4c6d3] bg-white p-5 rounded hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-[#8c4f00] font-bold">{problem.mode}</p>
                      {problem.status === 'CLOSED' && (
                        <p className="text-xs uppercase tracking-widest text-red-600 font-bold">Closed</p>
                      )}
                    </div>
                    {isAlreadyApplied && (
                      <span className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded">
                        ✓ Applied
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-[#002155]">{problem.title}</h3>

                  <p className="mt-2 text-xs text-[#434651]">
                    Type:{' '}
                    {problem.isIndustryProblem
                      ? `Industry${problem.industryName ? ` (${problem.industryName})` : ''}`
                      : 'Normal'}
                  </p>

                  <p className="mt-2 text-sm text-[#434651] line-clamp-3">{problem.description}</p>

                  {problem.tags && (
                    <p className="mt-2 text-xs text-[#434651]">
                      <span className="font-medium">Tags:</span> {problem.tags}
                    </p>
                  )}

                  <p className="mt-1 text-xs text-[#434651]">
                    <span className="font-medium">Applications:</span> {problem._count.applications}
                  </p>

                  {problem.supportDocumentUrl && (
                    <a
                      href={problem.supportDocumentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block mt-2 text-xs font-bold uppercase tracking-wider text-[#fd9923] underline hover:text-[#e68a00]"
                    >
                      View Support Document
                    </a>
                  )}

                  {/* Action Button */}
                  {isOpen ? (
                    <div className="mt-4">
                      {isAlreadyApplied ? (
                        <button
                          disabled
                          className="w-full bg-green-100 text-green-800 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded cursor-not-allowed"
                        >
                          ✓ Applied
                        </button>
                      ) : (
                        <button
                          onClick={() => handleApplyClick(problem)}
                          className="w-full bg-[#fd9923] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider rounded hover:bg-[#e68a00] transition-colors"
                        >
                          Apply Now
                        </button>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Apply Modal */}
      {applyingProblem && (
        <ApplyModal
          problemId={applyingProblem.id}
          problemTitle={applyingProblem.title}
          isOpen={isApplyModalOpen}
          onClose={() => {
            setIsApplyModalOpen(false);
            setApplyingProblem(null);
          }}
          onSuccess={handleApplySuccess}
        />
      )}
    </main>
  );
}