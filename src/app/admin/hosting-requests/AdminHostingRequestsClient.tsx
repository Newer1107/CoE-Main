'use client';

import { useEffect, useMemo, useState } from 'react';
import type { HostingRequestStatus } from '@prisma/client';
import HostingRequestStatusBadge from '@/components/HostingRequestStatusBadge';

type HostingRequestRecord = {
  id: number;
  projectName: string;
  projectDescription: string;
  githubUrl: string;
  projectCategory: string;
  techStack: string[];
  databaseRequired: boolean;
  databaseType: string;
  preferredSubdomain: string | null;
  teamMembers: string | null;
  facultyMentor: string | null;
  hostingDuration: string | null;
  additionalNotes: string | null;
  adminRemarks: string | null;
  status: HostingRequestStatus;
  reviewedAt: string | null;
  assignedDomain: string | null;
  coolifyProjectId: string | null;
  deploymentStatus: string | null;
  assignedDatabaseCredentials: Record<string, unknown> | null;
  hostingExpiryDate: string | null;
  createdAt: string;
  updatedAt: string;
  student: {
    id: number;
    name: string;
    email: string;
    uid: string | null;
    department: string | null;
    year: string | null;
    studentProfile: {
      id: number;
      skills: string | null;
      experience: string | null;
      interests: string | null;
      isComplete: boolean;
      updatedAt: string;
    } | null;
  };
  reviewedBy: {
    id: number;
    name: string;
    email: string;
  } | null;
  statusHistory: Array<{
    id: number;
    oldStatus: HostingRequestStatus;
    newStatus: HostingRequestStatus;
    remarks: string | null;
    createdAt: string;
    changedBy: {
      id: number;
      name: string;
      email: string;
      role: string;
    };
  }>;
};

type AdminData = {
  stats: {
    totalRequests: number;
    pendingReview: number;
    approved: number;
    rejected: number;
  };
  requests: HostingRequestRecord[];
};

const REVIEW_DEFAULTS = {
  status: 'UNDER_REVIEW' as HostingRequestStatus,
  adminRemarks: '',
  assignedDomain: '',
  deploymentStatus: '',
  coolifyProjectId: '',
  hostingExpiryDate: '',
  assignedDatabaseCredentials: '',
};

const toReviewForm = (request: HostingRequestRecord) => ({
  status: request.status === 'PENDING' ? 'UNDER_REVIEW' : request.status,
  adminRemarks: request.adminRemarks || '',
  assignedDomain: request.assignedDomain || '',
  deploymentStatus: request.deploymentStatus || '',
  coolifyProjectId: request.coolifyProjectId || '',
  hostingExpiryDate: request.hostingExpiryDate ? request.hostingExpiryDate.slice(0, 10) : '',
  assignedDatabaseCredentials: request.assignedDatabaseCredentials
    ? JSON.stringify(request.assignedDatabaseCredentials, null, 2)
    : '',
});

const formatDateTime = (value: string | null) => {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
};

export default function AdminHostingRequestsClient({ initialData }: { initialData: AdminData }) {
  const [data, setData] = useState(initialData);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | HostingRequestStatus>('ALL');
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(initialData.requests[0]?.id ?? null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [reviewForm, setReviewForm] = useState(
    initialData.requests[0] ? toReviewForm(initialData.requests[0]) : REVIEW_DEFAULTS
  );

  const selectedRequest = useMemo(
    () => data.requests.find((request) => request.id === selectedRequestId) ?? data.requests[0] ?? null,
    [data.requests, selectedRequestId]
  );

  useEffect(() => {
    if (selectedRequest) {
      setReviewForm(toReviewForm(selectedRequest));
    }
  }, [selectedRequest]);

  const refreshData = async (nextSearch = search, nextStatus = statusFilter) => {
    setLoading(true);
    setErrorMessage('');
    try {
      const params = new URLSearchParams();
      if (nextSearch.trim()) params.set('search', nextSearch.trim());
      if (nextStatus !== 'ALL') params.set('status', nextStatus);

      const response = await fetch(`/api/admin/hosting-requests?${params.toString()}`, { credentials: 'include' });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Failed to load hosting requests');
      }

      setData(payload.data as AdminData);
      setSelectedRequestId((current) =>
        payload.data.requests.some((request: HostingRequestRecord) => request.id === current)
          ? current
          : payload.data.requests[0]?.id ?? null
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load hosting requests');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRequest = (request: HostingRequestRecord) => {
    setSelectedRequestId(request.id);
    setReviewForm(toReviewForm(request));
  };

  const handleReviewSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRequest) return;

    setSaving(true);
    setStatusMessage('');
    setErrorMessage('');

    try {
      let parsedDatabaseCredentials: Record<string, unknown> | null = null;
      if (reviewForm.assignedDatabaseCredentials.trim()) {
        const parsed = JSON.parse(reviewForm.assignedDatabaseCredentials);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Assigned database credentials must be a JSON object.');
        }
        parsedDatabaseCredentials = parsed as Record<string, unknown>;
      }

      const response = await fetch(`/api/admin/hosting-requests/${selectedRequest.id}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...reviewForm,
          assignedDatabaseCredentials: parsedDatabaseCredentials,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Failed to update hosting request');
      }

      await refreshData();
      setSelectedRequestId(payload.data.id);
      setStatusMessage('Hosting request updated successfully.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update hosting request');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="max-w-[1560px] mx-auto mt-10 px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          Hosting Requests
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl text-sm">
          Review student hosting submissions, track decisions, and prepare the module for future Coolify deployment workflows.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-8">
        <article className="border border-[#c4c6d3] bg-white p-5">
          <p className="text-xs uppercase tracking-widest text-[#747782]">Total Requests</p>
          <p className="mt-3 text-3xl font-headline text-[#002155]">{data.stats.totalRequests}</p>
        </article>
        <article className="border border-[#c4c6d3] bg-white p-5">
          <p className="text-xs uppercase tracking-widest text-[#747782]">Pending Review</p>
          <p className="mt-3 text-3xl font-headline text-[#8c4f00]">{data.stats.pendingReview}</p>
        </article>
        <article className="border border-[#c4c6d3] bg-white p-5">
          <p className="text-xs uppercase tracking-widest text-[#747782]">Approved</p>
          <p className="mt-3 text-3xl font-headline text-[#0b6b2e]">{data.stats.approved}</p>
        </article>
        <article className="border border-[#c4c6d3] bg-white p-5">
          <p className="text-xs uppercase tracking-widest text-[#747782]">Rejected</p>
          <p className="mt-3 text-3xl font-headline text-[#991b1b]">{data.stats.rejected}</p>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[0.78fr_1.22fr]">
        <div className="space-y-6">
          <article className="border border-[#c4c6d3] bg-white p-5 md:p-6">
            <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by student, project, subdomain"
                className="border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'ALL' | HostingRequestStatus)}
                className="border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
              >
                <option value="ALL">All statuses</option>
                <option value="PENDING">Pending</option>
                <option value="UNDER_REVIEW">Under Review</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="CHANGES_REQUESTED">Changes Requested</option>
              </select>
              <button
                type="button"
                onClick={() => void refreshData(search, statusFilter)}
                disabled={loading}
                className="bg-[#002155] px-4 py-3 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-60"
              >
                {loading ? 'Loading...' : 'Apply'}
              </button>
            </div>

            {errorMessage ? <p className="mt-4 border border-[#fca5a5] bg-[#fee2e2] p-3 text-sm text-[#991b1b]">{errorMessage}</p> : null}
            {statusMessage ? <p className="mt-4 border border-[#86efac] bg-[#dcfce7] p-3 text-sm text-[#166534]">{statusMessage}</p> : null}

            <div className="mt-5 space-y-3">
              {data.requests.length === 0 ? (
                <p className="border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-4 text-sm text-[#434651]">
                  No hosting requests match the current filters.
                </p>
              ) : (
                data.requests.map((request) => (
                  <button
                    key={request.id}
                    type="button"
                    onClick={() => handleSelectRequest(request)}
                    className={`w-full border p-4 text-left transition-colors ${
                      selectedRequest?.id === request.id ? 'border-[#002155] bg-[#f5f4f0]' : 'border-[#e3e2df] bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-[#002155]">{request.projectName}</p>
                        <p className="mt-1 text-xs text-[#434651]">{request.student.name} • {request.student.uid || request.student.email}</p>
                      </div>
                      <HostingRequestStatusBadge status={request.status} />
                    </div>
                    <p className="mt-2 text-xs text-[#747782]">{request.projectCategory} • {formatDateTime(request.createdAt)}</p>
                  </button>
                ))
              )}
            </div>
          </article>
        </div>

        {selectedRequest ? (
          <div className="space-y-6">
            <article className="border border-[#c4c6d3] bg-white p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-widest text-[#8c4f00]">Request Detail</p>
                  <h2 className="mt-1 text-2xl font-headline text-[#002155]">{selectedRequest.projectName}</h2>
                </div>
                <HostingRequestStatusBadge status={selectedRequest.status} />
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 text-sm text-[#434651]">
                <p><span className="font-semibold text-[#002155]">Student:</span> {selectedRequest.student.name}</p>
                <p><span className="font-semibold text-[#002155]">UID:</span> {selectedRequest.student.uid || 'Not available'}</p>
                <p><span className="font-semibold text-[#002155]">Email:</span> {selectedRequest.student.email}</p>
                <p><span className="font-semibold text-[#002155]">Category:</span> {selectedRequest.projectCategory}</p>
                <p><span className="font-semibold text-[#002155]">GitHub:</span> <a className="text-[#8c4f00] underline" href={selectedRequest.githubUrl} target="_blank" rel="noreferrer">{selectedRequest.githubUrl}</a></p>
                <p><span className="font-semibold text-[#002155]">Subdomain:</span> {selectedRequest.preferredSubdomain || 'Not provided'}</p>
                <p><span className="font-semibold text-[#002155]">Tech Stack:</span> {selectedRequest.techStack.join(', ') || 'Not provided'}</p>
                <p><span className="font-semibold text-[#002155]">Database:</span> {selectedRequest.databaseRequired ? selectedRequest.databaseType : 'Not required'}</p>
                <p><span className="font-semibold text-[#002155]">Faculty Mentor:</span> {selectedRequest.facultyMentor || 'Not provided'}</p>
                <p><span className="font-semibold text-[#002155]">Hosting Duration:</span> {selectedRequest.hostingDuration || 'Not provided'}</p>
              </div>

              <div className="mt-4 border-t border-[#e3e2df] pt-4 text-sm text-[#434651]">
                <p><span className="font-semibold text-[#002155]">Description:</span> {selectedRequest.projectDescription}</p>
                {selectedRequest.teamMembers ? <p className="mt-3"><span className="font-semibold text-[#002155]">Team Members:</span> {selectedRequest.teamMembers}</p> : null}
                {selectedRequest.additionalNotes ? <p className="mt-3"><span className="font-semibold text-[#002155]">Additional Notes:</span> {selectedRequest.additionalNotes}</p> : null}
              </div>
            </article>

            <article className="border border-[#c4c6d3] bg-white p-5 md:p-6">
              <div className="mb-5">
                <p className="text-xs uppercase tracking-widest text-[#8c4f00]">Admin Action</p>
                <h3 className="mt-1 text-2xl font-headline text-[#002155]">Review Workflow</h3>
              </div>

              <form onSubmit={handleReviewSubmit} className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[#002155]">Decision</span>
                    <select
                      value={reviewForm.status}
                      onChange={(event) => setReviewForm({ ...reviewForm, status: event.target.value as HostingRequestStatus })}
                      className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
                    >
                      <option value="UNDER_REVIEW">Under Review</option>
                      <option value="APPROVED">Approve</option>
                      <option value="REJECTED">Reject</option>
                      <option value="CHANGES_REQUESTED">Request Changes</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[#002155]">Assigned Domain</span>
                    <input
                      value={reviewForm.assignedDomain}
                      onChange={(event) => setReviewForm({ ...reviewForm, assignedDomain: event.target.value.toLowerCase() })}
                      className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
                      placeholder="project.tcetcercd.in"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[#002155]">Deployment Notes / Remarks</span>
                  <textarea
                    value={reviewForm.adminRemarks}
                    onChange={(event) => setReviewForm({ ...reviewForm, adminRemarks: event.target.value })}
                    rows={4}
                    className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
                    placeholder="Required for approval, rejection, or change requests"
                    required
                  />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[#002155]">Deployment Status</span>
                    <input
                      value={reviewForm.deploymentStatus}
                      onChange={(event) => setReviewForm({ ...reviewForm, deploymentStatus: event.target.value })}
                      className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
                      placeholder="Queued, Provisioned, Live"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[#002155]">Coolify Project ID</span>
                    <input
                      value={reviewForm.coolifyProjectId}
                      onChange={(event) => setReviewForm({ ...reviewForm, coolifyProjectId: event.target.value })}
                      className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
                    />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[#002155]">Hosting Expiry Date</span>
                    <input
                      type="date"
                      value={reviewForm.hostingExpiryDate}
                      onChange={(event) => setReviewForm({ ...reviewForm, hostingExpiryDate: event.target.value })}
                      className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[#002155]">Assigned Database Credentials</span>
                    <textarea
                      value={reviewForm.assignedDatabaseCredentials}
                      onChange={(event) => setReviewForm({ ...reviewForm, assignedDatabaseCredentials: event.target.value })}
                      rows={4}
                      className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
                      placeholder={'{"host":"...", "username":"...", "database":"..."}'}
                    />
                  </label>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-[#002155] px-5 py-3 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : 'Save Decision'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectRequest(selectedRequest)}
                    className="border border-[#c4c6d3] px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#434651]"
                  >
                    Reset Form
                  </button>
                </div>
              </form>
            </article>

            <article className="border border-[#c4c6d3] bg-white p-5 md:p-6">
              <h3 className="text-2xl font-headline text-[#002155]">Activity Timeline</h3>
              <div className="mt-4 space-y-3">
                {selectedRequest.statusHistory.map((entry) => (
                  <div key={entry.id} className="border-l-2 border-[#c4c6d3] pl-4">
                    <p className="text-xs uppercase tracking-widest text-[#8c4f00]">
                      {entry.oldStatus === entry.newStatus ? entry.newStatus.replaceAll('_', ' ') : `${entry.oldStatus.replaceAll('_', ' ')} -> ${entry.newStatus.replaceAll('_', ' ')}`}
                    </p>
                    <p className="mt-1 text-sm text-[#002155]">{entry.changedBy.name} ({entry.changedBy.role})</p>
                    <p className="mt-1 text-xs text-[#747782]">{formatDateTime(entry.createdAt)}</p>
                    {entry.remarks ? <p className="mt-2 text-sm text-[#434651]">{entry.remarks}</p> : null}
                  </div>
                ))}
              </div>
            </article>
          </div>
        ) : null}
      </section>
    </main>
  );
}
