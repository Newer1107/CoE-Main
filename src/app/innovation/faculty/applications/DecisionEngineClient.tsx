'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type ApplicationStatus = 'SUBMITTED' | 'SELECTED' | 'REJECTED';

interface ApplicationAnswer {
  id: number;
  question: string;
  answer: string;
}

interface ApplicationRow {
  id: number;
  problemTitle: string;
  problemId: number;
  status: ApplicationStatus;
  createdAt: string;
  student: {
    id: number;
    name: string;
    email: string;
    uid: string | null;
  };
  profile: {
    skills: string | null;
    experience: string | null;
    interests: string | null;
    resumeUrl: string | null;
    resumeFileName: string | null;
  };
  answers: ApplicationAnswer[];
}

interface ApplicationsResponse {
  items: ApplicationRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  titles: string[];
  matchingIds?: number[];
}

const statusBadge = (status: ApplicationStatus) => {
  switch (status) {
    case 'SUBMITTED':
      return { label: 'Submitted', color: 'bg-yellow-100 text-yellow-800' };
    case 'SELECTED':
      return { label: 'Selected', color: 'bg-green-100 text-green-800' };
    case 'REJECTED':
      return { label: 'Rejected', color: 'bg-red-100 text-red-800' };
    default:
      return { label: status, color: 'bg-gray-100 text-gray-800' };
  }
};

export default function DecisionEngineClient() {
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [titles, setTitles] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [problemTitle, setProblemTitle] = useState('');
  const [status, setStatus] = useState<'ALL' | ApplicationStatus>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectAllFiltered, setSelectAllFiltered] = useState(false);

  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchIdRef = useRef(0);

  const selectedCount = selectedIds.size;

  const handleExport = () => {
    const params = new URLSearchParams();
    if (problemTitle) params.set('problemTitle', problemTitle);
    if (status !== 'ALL') params.set('status', status);
    if (debouncedSearch.trim().length > 0) params.set('search', debouncedSearch.trim());
    window.location.href = `/api/applications/export?${params.toString()}`;
  };

  const fetchApplications = useCallback(async (includeIds = false) => {
    const params = new URLSearchParams();
    if (problemTitle) params.set('problemTitle', problemTitle);
    if (status !== 'ALL') params.set('status', status);
    if (debouncedSearch.trim().length > 0) params.set('search', debouncedSearch.trim());
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    params.set('includeTitles', 'true');
    if (includeIds) params.set('includeIds', 'true');

    const res = await fetch(`/api/applications?${params.toString()}`);
    if (!res.ok) {
      throw new Error('Failed to load applications');
    }

    const json = await res.json();
    return (json.data || {}) as ApplicationsResponse;
  }, [problemTitle, status, debouncedSearch, page, pageSize]);

  const reloadApplications = useCallback(async () => {
    const data = await fetchApplications(false);
    setApplications(data.items || []);
    setTitles(data.titles || []);
    setTotalCount(data.pagination?.total || 0);
    setTotalPages(data.pagination?.totalPages || 1);
  }, [fetchApplications]);

  useEffect(() => {
    const fetchId = ++lastFetchIdRef.current;
    setIsFetching(true);
    setError(null);

    fetchApplications(false)
      .then((data) => {
        if (fetchId !== lastFetchIdRef.current) return;
        setApplications(data.items || []);
        setTitles(data.titles || []);
        setTotalCount(data.pagination?.total || 0);
        setTotalPages(data.pagination?.totalPages || 1);
        setInitialLoading(false);
        setIsFetching(false);
      })
      .catch((err) => {
        if (fetchId !== lastFetchIdRef.current) return;
        setError(err instanceof Error ? err.message : 'Error loading applications');
        setInitialLoading(false);
        setIsFetching(false);
      });
  }, [fetchApplications]);

  useEffect(() => {
    setExpandedId(null);
    setSelectedIds(new Set());
    setSelectAllFiltered(false);
  }, [problemTitle, status, debouncedSearch]);

  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setDebouncedSearch(searchInput.trim());
    }, 500);
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [problemTitle, status]);

  const toggleSelection = (applicationId: number) => {
    setSelectAllFiltered(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(applicationId)) {
        next.delete(applicationId);
      } else {
        next.add(applicationId);
      }
      return next;
    });
  };

  const allPageSelected = applications.length > 0 && applications.every((app) => selectedIds.has(app.id));

  const toggleSelectAllOnPage = () => {
    setSelectAllFiltered(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        applications.forEach((app) => next.delete(app.id));
      } else {
        applications.forEach((app) => next.add(app.id));
      }
      return next;
    });
  };

  const handleSelectAllFiltered = async () => {
    setError(null);
    setSuccessMessage(null);
    setActionLoading(true);

    try {
      const data = await fetchApplications(true);
      const ids = data.matchingIds || [];
      setSelectedIds(new Set(ids));
      setSelectAllFiltered(true);
      if (ids.length === 0) {
        setError('No applications match the current filters.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select filtered applications');
    } finally {
      setActionLoading(false);
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectAllFiltered(false);
  };

  const runBulkReview = async (nextStatus: 'SELECTED' | 'REJECTED') => {
    if (selectedIds.size === 0) {
      setError('Select at least one application first.');
      return;
    }

    setActionLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const ids = Array.from(selectedIds);
      const responses = await Promise.all(
        ids.map(async (id) => {
          const res = await fetch(`/api/innovation/faculty/applications/${id}/review`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: nextStatus }),
          });
          const payload = await res.json().catch(() => ({}));
          return { ok: res.ok, payload };
        })
      );

      const failed = responses.filter((r) => !r.ok);
      if (failed.length > 0) {
        const firstError = failed[0]?.payload?.message || 'Some applications could not be updated.';
        throw new Error(firstError);
      }

      await reloadApplications();
      clearSelection();
      setSuccessMessage(`${ids.length} application${ids.length === 1 ? '' : 's'} updated to ${nextStatus}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update selected applications');
    } finally {
      setActionLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <main className="max-w-7xl mx-auto px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
        <div className="text-center text-[#434651]">Loading applications...</div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          Internship Applications
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body text-sm">
          Review submissions, filter quickly, and bulk mark shortlisted candidates.
        </p>
      </header>

      <div className="mb-4 text-xs text-[#747782]">
        Search is debounced by 500ms to avoid page jitter while typing.
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-800 text-sm rounded">
          <p className="font-medium">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-500 text-green-800 text-sm rounded">
          <p className="font-medium">{successMessage}</p>
        </div>
      )}

      <section className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[#747782] mb-2">
            Problem Title
          </label>
          <select
            value={problemTitle}
            onChange={(event) => {
              setProblemTitle(event.target.value);
            }}
            className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm focus:outline-none focus:border-[#fd9923]"
          >
            <option value="">All Problems</option>
            {titles.map((title) => (
              <option key={title} value={title}>
                {title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[#747782] mb-2">
            Status
          </label>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as 'ALL' | ApplicationStatus);
            }}
            className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm focus:outline-none focus:border-[#fd9923]"
          >
            <option value="ALL">All Statuses</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="SELECTED">Selected</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[#747782] mb-2">
            Search
          </label>
          <input
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
            }}
            placeholder="Search by student name or email"
            className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm focus:outline-none focus:border-[#fd9923]"
          />
        </div>
      </section>

      {isFetching && (
        <div className="mb-4 text-xs text-[#002155]">Refreshing results...</div>
      )}

      {applications.length === 0 ? (
        <div className="border border-dashed border-[#c4c6d3] bg-white p-8 rounded text-center">
          <p className="text-[#434651] font-medium">No applications match the current filters.</p>
        </div>
      ) : (
        <div className="border border-[#c4c6d3] bg-white rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-[#e0e2ea] bg-[#f9f8f4] text-sm text-[#434651] flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectAllOnPage}
                  className="h-4 w-4"
                />
                <span>Select all on page</span>
              </label>
              <button
                onClick={handleSelectAllFiltered}
                disabled={actionLoading}
                className="px-3 py-2 text-xs font-semibold border border-[#002155] text-[#002155] rounded hover:bg-[#002155] hover:text-white transition disabled:opacity-50"
              >
                Select all filtered ({totalCount})
              </button>
              <button
                onClick={clearSelection}
                disabled={actionLoading || selectedCount === 0}
                className="px-3 py-2 text-xs font-semibold border border-[#c4c6d3] text-[#434651] rounded hover:border-[#002155] transition disabled:opacity-50"
              >
                Clear
              </button>
              <span>Showing {applications.length} of {totalCount}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleExport}
                className="px-3 py-2 text-xs font-semibold border border-[#fd9923] text-[#fd9923] rounded hover:bg-[#fd9923] hover:text-white transition"
              >
                Export CSV
              </button>
              <button
                onClick={() => runBulkReview('SELECTED')}
                disabled={actionLoading || selectedCount === 0}
                className="px-3 py-2 text-xs font-semibold border border-green-700 text-green-700 rounded hover:bg-green-700 hover:text-white transition disabled:opacity-50"
              >
                Mark Selected ({selectedCount})
              </button>
              <button
                onClick={() => runBulkReview('REJECTED')}
                disabled={actionLoading || selectedCount === 0}
                className="px-3 py-2 text-xs font-semibold border border-red-700 text-red-700 rounded hover:bg-red-700 hover:text-white transition disabled:opacity-50"
              >
                Mark Rejected ({selectedCount})
              </button>
            </div>
          </div>

          {(selectedCount > 0 || selectAllFiltered) && (
            <div className="px-4 py-2 border-b border-[#e0e2ea] bg-[#eef4ff] text-xs text-[#002155]">
              {selectAllFiltered
                ? `${selectedCount} filtered application${selectedCount === 1 ? '' : 's'} selected`
                : `${selectedCount} application${selectedCount === 1 ? '' : 's'} selected`}
            </div>
          )}

          <div className="space-y-0">
            {applications.map((app) => {
              const badge = statusBadge(app.status);
              const isExpanded = expandedId === app.id;

              return (
                <div key={app.id} className="border-b border-[#f0f0f4] last:border-b-0">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : app.id)}
                    className="w-full text-left px-4 py-3 hover:bg-[#faf8f2] transition"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="pr-2" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(app.id)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggleSelection(app.id)}
                          className="h-4 w-4"
                        />
                      </div>
                      <div>
                        <p className="font-medium text-[#002155]">{app.student.name}</p>
                        <p className="text-xs text-[#747782]">{app.student.email}</p>
                        {app.student.uid && (
                          <p className="text-xs text-[#747782]">UID: {app.student.uid}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-[#434651]">{app.problemTitle}</p>
                        <span className={`inline-block mt-1 px-2 py-1 rounded text-xs font-bold ${badge.color}`}>
                          {badge.label}
                        </span>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 bg-[#faf8f2] border-t border-[#f0f0f4]">
                      <p className="text-xs text-[#747782] mt-3">
                        Applied on {new Date(app.createdAt).toLocaleDateString()}
                      </p>

                      <div className="mt-3 space-y-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-[#747782] mb-1">Skills</p>
                            <p className="text-sm text-[#434651] whitespace-pre-wrap">
                              {app.profile.skills || 'Not specified'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-[#747782] mb-1">Interests</p>
                            <p className="text-sm text-[#434651] whitespace-pre-wrap">
                              {app.profile.interests || 'Not specified'}
                            </p>
                          </div>
                          <div className="md:col-span-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-[#747782] mb-1">Experience</p>
                            <p className="text-sm text-[#434651] whitespace-pre-wrap">
                              {app.profile.experience || 'Not specified'}
                            </p>
                          </div>
                          <div className="md:col-span-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-[#747782] mb-1">Resume</p>
                            {app.profile.resumeUrl ? (
                              <a
                                href={app.profile.resumeUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-[#002155] underline"
                              >
                                {app.profile.resumeFileName || 'Download resume'}
                              </a>
                            ) : (
                              <p className="text-sm text-[#434651]">Not uploaded</p>
                            )}
                          </div>
                        </div>

                        {app.answers.length === 0 && (
                          <p className="text-sm text-[#747782]">No answers found for this application.</p>
                        )}
                        {app.answers.map((ans) => (
                          <div key={ans.id} className="bg-white border border-[#e0e2ea] rounded p-3">
                            <p className="text-sm font-semibold text-[#002155]">{ans.question}</p>
                            <p className="text-sm text-[#434651] mt-1">{ans.answer}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-[#747782]">
          Page {page} of {Math.max(1, totalPages)}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page === 1}
            className="px-3 py-2 text-xs font-semibold border border-[#c4c6d3] text-[#434651] rounded hover:border-[#002155] transition"
          >
            Previous
          </button>
          <button
            onClick={() => setPage((prev) => prev + 1)}
            disabled={page >= totalPages}
            className="px-3 py-2 text-xs font-semibold border border-[#c4c6d3] text-[#434651] rounded hover:border-[#002155] transition"
          >
            Next
          </button>
        </div>
      </div>
    </main>
  );
}
