'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

type InternshipApplicationStatus = 'SUBMITTED' | 'SELECTED' | 'REJECTED';

interface InternshipApplicationRow {
  id: number;
  problemTitle: string;
  problemId: number;
  status: InternshipApplicationStatus;
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
}

interface ApplicationsResponse {
  items: InternshipApplicationRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  titles: string[];
  matchingIds: number[];
}

const statusBadge = (status: InternshipApplicationStatus) => {
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
  const [applications, setApplications] = useState<InternshipApplicationRow[]>([]);
  const [titles, setTitles] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [problemTitle, setProblemTitle] = useState('');
  const [status, setStatus] = useState<'ALL' | InternshipApplicationStatus>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectAllFiltered, setSelectAllFiltered] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const selectedCount = selectedIds.size;
  const selectedIdsArray = useMemo(() => Array.from(selectedIds), [selectedIds]);

  const handleExport = () => {
    const params = new URLSearchParams();
    if (problemTitle) params.set('problemTitle', problemTitle);
    if (status !== 'ALL') params.set('status', status);
    if (search.trim().length > 0) params.set('search', search.trim());
    window.location.href = `/api/applications/export?${params.toString()}`;
  };

  const fetchApplications = useCallback(async (includeIds = false) => {
    const params = new URLSearchParams();
    if (problemTitle) params.set('problemTitle', problemTitle);
    if (status !== 'ALL') params.set('status', status);
    if (search.trim().length > 0) params.set('search', search.trim());
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
  }, [problemTitle, status, search, page, pageSize]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    fetchApplications(false)
      .then((data) => {
        if (!active) return;
        setApplications(data.items || []);
        setTitles(data.titles || []);
        setTotalCount(data.pagination?.total || 0);
        setTotalPages(data.pagination?.totalPages || 1);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Error loading applications');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fetchApplications]);

  useEffect(() => {
    setSelectedIds(new Set());
    setConfirmOpen(false);
    setSelectAllFiltered(false);
    setExpandedId(null);
  }, [problemTitle, status, search]);

  const toggleSelection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = async () => {
    if (!problemTitle) {
      setError('Select a specific internship title before selecting all applications.');
      return;
    }

    if (status !== 'ALL' && status !== 'SUBMITTED') {
      setError('Bulk acceptance is only available for SUBMITTED applications.');
      return;
    }

    setSelectedIds(new Set());
    setSelectAllFiltered(true);
  };

  const handleBulkAccept = async () => {
    if (!problemTitle) {
      setError('Select an internship title before accepting applications.');
      return;
    }

    if (!selectAllFiltered && selectedIdsArray.length === 0) {
      setError('Select at least one application before accepting.');
      return;
    }

    if (status !== 'ALL' && status !== 'SUBMITTED') {
      setError('Bulk acceptance is only available for SUBMITTED applications.');
      return;
    }

    setActionLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/applications/accept-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectionMode: selectAllFiltered ? 'FILTERED' : 'IDS',
          applicationIds: selectAllFiltered ? undefined : selectedIdsArray,
          filters: selectAllFiltered
            ? {
                problemTitle,
                search: search.trim() || undefined,
                status: 'SUBMITTED',
              }
            : undefined,
          problemTitle,
        }),
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.message || 'Bulk acceptance failed');
      }

      setConfirmOpen(false);
      setSelectedIds(new Set());
      setSelectAllFiltered(false);
      await fetchApplications(false).then((data) => {
        setApplications(data.items || []);
        setTitles(data.titles || []);
        setTotalCount(data.pagination?.total || 0);
        setTotalPages(data.pagination?.totalPages || 1);
      });

      const problemId = payload?.data?.problemId as number | undefined;
      const acceptedCount = payload?.data?.acceptedCount ?? 0;
      const rejectedCount = payload?.data?.rejectedCount ?? 0;

      setSuccessMessage(`${acceptedCount} accepted • ${rejectedCount} rejected`);

      if (problemId) {
        window.setTimeout(() => {
          window.location.href = `/industry-internship/${problemId}`;
        }, 800);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk acceptance failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
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
          Internship Decisions
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body text-sm">
          Filter applications, select candidates in bulk, and finalize internship cohorts.
        </p>
      </header>

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
            Internship Title
          </label>
          <select
            value={problemTitle}
            onChange={(event) => {
              setPage(1);
              setProblemTitle(event.target.value);
            }}
            className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm focus:outline-none focus:border-[#fd9923]"
          >
            <option value="">All Titles</option>
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
              setPage(1);
              setStatus(event.target.value as 'ALL' | InternshipApplicationStatus);
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
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            placeholder="Search by student name or email"
            className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm focus:outline-none focus:border-[#fd9923]"
          />
        </div>
      </section>

      {applications.length === 0 ? (
        <div className="border border-dashed border-[#c4c6d3] bg-white p-8 rounded text-center">
          <p className="text-[#434651] font-medium">
            No applications match the current filters.
          </p>
        </div>
      ) : (
        <div className="border border-[#c4c6d3] bg-white rounded overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e0e2ea] bg-[#f9f8f4]">
            <div className="text-sm text-[#434651]">
                Showing {applications.length} of {totalCount}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExport}
                className="px-3 py-2 text-xs font-semibold border border-[#fd9923] text-[#fd9923] rounded hover:bg-[#fd9923] hover:text-white transition"
              >
                Export CSV
              </button>
              <button
                onClick={handleSelectAll}
                disabled={actionLoading}
                className="px-3 py-2 text-xs font-semibold border border-[#002155] text-[#002155] rounded hover:bg-[#002155] hover:text-white transition"
              >
                Select All (Filtered)
              </button>
              <button
                onClick={() => setAddOpen(true)}
                className="px-3 py-2 text-xs font-semibold border border-[#002155] text-[#002155] rounded hover:bg-[#002155] hover:text-white transition"
              >
                Add Person
              </button>
              <button
                onClick={() => {
                  setSelectedIds(new Set());
                  setSelectAllFiltered(false);
                }}
                disabled={selectedCount === 0 && !selectAllFiltered}
                className="px-3 py-2 text-xs font-semibold border border-[#c4c6d3] text-[#434651] rounded hover:border-[#002155] transition"
              >
                Clear Selection
              </button>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-white">
              <tr className="text-left text-[#747782] uppercase text-xs border-b border-[#e0e2ea]">
                <th className="px-4 py-3">Select</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Internship</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Profile</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => {
                const badge = statusBadge(app.status);
                return (
                  <Fragment key={app.id}>
                    <tr className="border-b border-[#f0f0f4] hover:bg-[#faf8f2]">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(app.id)}
                          onChange={() => toggleSelection(app.id)}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#002155]">{app.student.name}</p>
                        <p className="text-xs text-[#747782]">{app.student.email}</p>
                        {app.student.uid && (
                          <p className="text-xs text-[#747782]">UID: {app.student.uid}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#434651]">{app.problemTitle}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${badge.color}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#747782]">
                        {new Date(app.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setExpandedId((prev) => (prev === app.id ? null : app.id))}
                          className="text-xs font-semibold text-[#002155] underline"
                        >
                          {expandedId === app.id ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === app.id && (
                      <tr className="border-b border-[#f0f0f4] bg-[#fcfbf7]">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-[#747782] mb-1">Skills</p>
                              <p className="text-[#434651] whitespace-pre-wrap">
                                {app.profile.skills || 'Not specified'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-[#747782] mb-1">Interests</p>
                              <p className="text-[#434651] whitespace-pre-wrap">
                                {app.profile.interests || 'Not specified'}
                              </p>
                            </div>
                            <div className="md:col-span-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-[#747782] mb-1">Experience</p>
                              <p className="text-[#434651] whitespace-pre-wrap">
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
                                  className="text-[#002155] underline"
                                >
                                  {app.profile.resumeFileName || 'Download resume'}
                                </a>
                              ) : (
                                <p className="text-[#434651]">Not uploaded</p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
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

      {(selectedCount > 0 || selectAllFiltered) && (
        <div className="mt-8 border border-[#002155] bg-[#002155] text-white rounded px-4 py-4 flex items-center justify-between">
          <div className="text-sm">
            {selectAllFiltered
              ? `${totalCount} candidate${totalCount === 1 ? '' : 's'} selected (filtered)`
              : `${selectedCount} candidate${selectedCount === 1 ? '' : 's'} selected`}
          </div>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={actionLoading}
            className="px-4 py-2 bg-[#fd9923] text-[#1f1f1f] text-sm font-semibold rounded hover:brightness-95 transition"
          >
            Accept Selected
          </button>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded shadow-lg max-w-lg w-full p-6">
            <h2 className="text-lg font-bold text-[#002155] mb-3">Confirm Acceptance</h2>
            <p className="text-sm text-[#434651]">
              Accept {selectAllFiltered ? totalCount : selectedCount} candidate{(selectAllFiltered ? totalCount : selectedCount) === 1 ? '' : 's'} and reject all other
              applications for this internship?
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 text-sm font-semibold border border-[#c4c6d3] rounded text-[#434651]"
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAccept}
                disabled={actionLoading}
                className="px-4 py-2 text-sm font-semibold bg-[#002155] text-white rounded"
              >
                {actionLoading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {addOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded shadow-lg max-w-lg w-full p-6">
            <h2 className="text-lg font-bold text-[#002155] mb-3">Add Participant</h2>
                <p className="text-sm text-[#434651]">Add a student to the selected internship cohort by email.</p>
            <div className="mt-4 space-y-3">
              <input
                    value={problemTitle}
                    onChange={(e) => setProblemTitle(e.target.value)}
                    placeholder="Internship title"
                className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm"
              />
              <input
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="Student email"
                className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm"
              />
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setAddOpen(false)}
                className="px-4 py-2 text-sm font-semibold border border-[#c4c6d3] rounded text-[#434651]"
                disabled={addLoading}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!problemTitle && addEmail.trim() === '') {
                    setError('Internship title and student email are required.');
                    return;
                  }
                  setAddLoading(true);
                  setError(null);
                  try {
                    const res = await fetch('/api/internships/add-participant', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ problemTitle: problemTitle || undefined, studentEmail: addEmail.trim() }),
                    });
                    const payload = await res.json();
                    if (!res.ok) throw new Error(payload?.message || 'Failed to add participant');
                    setAddOpen(false);
                    setAddEmail('');
                    await fetchApplications(false).then((data) => {
                      setApplications(data.items || []);
                      setTitles(data.titles || []);
                      setTotalCount(data.pagination?.total || 0);
                      setTotalPages(data.pagination?.totalPages || 1);
                    });
                    setSuccessMessage('Participant added');
                    // optionally navigate to internship workspace if created
                    const problemId = payload?.data?.problemId as number | undefined;
                    if (problemId) {
                      window.setTimeout(() => { window.location.href = `/industry-internship/${problemId}`; }, 700);
                    }
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to add participant');
                  } finally {
                    setAddLoading(false);
                  }
                }}
                disabled={addLoading}
                className="px-4 py-2 text-sm font-semibold bg-[#002155] text-white rounded"
              >
                {addLoading ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
