'use client';

import { useMemo, useState } from 'react';
import type { DatabaseType, HostingRequestStatus } from '@prisma/client';
import HostingRequestStatusBadge from '@/components/HostingRequestStatusBadge';

type StudentIdentity = {
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

type HostingRequestRecord = {
  id: number;
  projectName: string;
  projectDescription: string;
  githubUrl: string;
  projectCategory: string;
  techStack: string[];
  databaseRequired: boolean;
  databaseType: DatabaseType;
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

type DashboardData = {
  student: StudentIdentity;
  stats: {
    totalRequests: number;
    approvedRequests: number;
    pendingRequests: number;
  };
  requests: HostingRequestRecord[];
};

type FormState = {
  projectName: string;
  projectDescription: string;
  githubUrl: string;
  projectCategory: string;
  techStack: string;
  databaseRequired: boolean;
  databaseType: DatabaseType;
  preferredSubdomain: string;
  teamMembers: string;
  facultyMentor: string;
  hostingDuration: string;
  additionalNotes: string;
};

const EMPTY_FORM: FormState = {
  projectName: '',
  projectDescription: '',
  githubUrl: '',
  projectCategory: '',
  techStack: '',
  databaseRequired: false,
  databaseType: 'NONE',
  preferredSubdomain: '',
  teamMembers: '',
  facultyMentor: '',
  hostingDuration: '',
  additionalNotes: '',
};

const formatDateTime = (value: string | null) => {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
};

const toFormState = (request: HostingRequestRecord): FormState => ({
  projectName: request.projectName,
  projectDescription: request.projectDescription,
  githubUrl: request.githubUrl,
  projectCategory: request.projectCategory,
  techStack: request.techStack.join(', '),
  databaseRequired: request.databaseRequired,
  databaseType: request.databaseType,
  preferredSubdomain: request.preferredSubdomain || '',
  teamMembers: request.teamMembers || '',
  facultyMentor: request.facultyMentor || '',
  hostingDuration: request.hostingDuration || '',
  additionalNotes: request.additionalNotes || '',
});

export default function ProjectHostingClient({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState(initialData);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingRequestId, setEditingRequestId] = useState<number | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(initialData.requests[0]?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const selectedRequest = useMemo(
    () => data.requests.find((request) => request.id === selectedRequestId) ?? data.requests[0] ?? null,
    [data.requests, selectedRequestId]
  );

  const refreshData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/project-hosting', { credentials: 'include' });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Failed to reload hosting requests');
      }
      setData(payload.data as DashboardData);
      setSelectedRequestId((current) =>
        payload.data.requests.some((request: HostingRequestRecord) => request.id === current)
          ? current
          : payload.data.requests[0]?.id ?? null
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to reload hosting requests');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (request: HostingRequestRecord) => {
    setEditingRequestId(request.id);
    setSelectedRequestId(request.id);
    setForm(toFormState(request));
    setStatusMessage('');
    setErrorMessage('');
  };

  const resetForm = () => {
    setEditingRequestId(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage('');
    setStatusMessage('');

    try {
      const body = {
        ...form,
        techStack: form.techStack
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        databaseType: form.databaseRequired ? form.databaseType : 'NONE',
      };

      const response = await fetch(editingRequestId ? `/api/project-hosting/${editingRequestId}` : '/api/project-hosting', {
        method: editingRequestId ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Failed to save hosting request');
      }

      await refreshData();
      resetForm();
      setSelectedRequestId(payload.data.id);
      setStatusMessage(editingRequestId ? 'Hosting request updated and resubmitted.' : 'Hosting request submitted successfully.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save hosting request');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="max-w-7xl mx-auto mt-10 px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          Project Hosting
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl text-sm">
          Submit, track, and update project hosting requests from one workspace.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-8">
        <article className="border border-[#c4c6d3] bg-white p-5">
          <p className="text-xs uppercase tracking-widest text-[#747782]">Total Requests</p>
          <p className="mt-3 text-3xl font-headline text-[#002155]">{data.stats.totalRequests}</p>
        </article>
        <article className="border border-[#c4c6d3] bg-white p-5">
          <p className="text-xs uppercase tracking-widest text-[#747782]">Approved Requests</p>
          <p className="mt-3 text-3xl font-headline text-[#0b6b2e]">{data.stats.approvedRequests}</p>
        </article>
        <article className="border border-[#c4c6d3] bg-white p-5">
          <p className="text-xs uppercase tracking-widest text-[#747782]">Pending Requests</p>
          <p className="mt-3 text-3xl font-headline text-[#8c4f00]">{data.stats.pendingRequests}</p>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <article className="border border-[#c4c6d3] bg-white p-5 md:p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-[#8c4f00]">Student Identity</p>
                <h2 className="mt-1 text-2xl font-headline text-[#002155]">Auto-filled Details</h2>
              </div>
              {data.student.studentProfile?.isComplete ? (
                <span className="border border-[#86efac] bg-[#dcfce7] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#166534]">
                  Profile Complete
                </span>
              ) : (
                <span className="border border-[#f4c95d] bg-[#fff2cc] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#8c4f00]">
                  Profile Partial
                </span>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-[#747782]">Name</p>
                <p className="mt-1 text-sm font-semibold text-[#002155]">{data.student.name}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-widest text-[#747782]">Email</p>
                <p className="mt-1 text-sm font-semibold text-[#002155]">{data.student.email}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-widest text-[#747782]">UID</p>
                <p className="mt-1 text-sm font-semibold text-[#002155]">{data.student.uid || 'Not available'}</p>
              </div>
            </div>
          </article>

          <article className="border border-[#c4c6d3] bg-white p-5 md:p-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <p className="text-xs uppercase tracking-widest text-[#8c4f00]">{editingRequestId ? 'Edit Request' : 'New Request'}</p>
                <h2 className="mt-1 text-2xl font-headline text-[#002155]">
                  {editingRequestId ? 'Update Hosting Request' : 'Submit Hosting Request'}
                </h2>
              </div>
              {editingRequestId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="border border-[#c4c6d3] px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#434651]"
                >
                  Cancel Edit
                </button>
              ) : null}
            </div>

            {statusMessage ? <p className="mb-4 border border-[#86efac] bg-[#dcfce7] p-3 text-sm text-[#166534]">{statusMessage}</p> : null}
            {errorMessage ? <p className="mb-4 border border-[#fca5a5] bg-[#fee2e2] p-3 text-sm text-[#991b1b]">{errorMessage}</p> : null}

            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[#002155]">Project Name</span>
                  <input
                    value={form.projectName}
                    onChange={(event) => setForm({ ...form, projectName: event.target.value })}
                    className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[#002155]">Project Category</span>
                  <input
                    value={form.projectCategory}
                    onChange={(event) => setForm({ ...form, projectCategory: event.target.value })}
                    className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
                    placeholder="AI, Web App, IoT, Research"
                    required
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[#002155]">Project Description</span>
                <textarea
                  value={form.projectDescription}
                  onChange={(event) => setForm({ ...form, projectDescription: event.target.value })}
                  rows={5}
                  className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
                  required
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[#002155]">GitHub Repository URL</span>
                  <input
                    type="url"
                    value={form.githubUrl}
                    onChange={(event) => setForm({ ...form, githubUrl: event.target.value })}
                    className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[#002155]">Preferred Subdomain</span>
                  <input
                    value={form.preferredSubdomain}
                    onChange={(event) => setForm({ ...form, preferredSubdomain: event.target.value.toLowerCase() })}
                    className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
                    placeholder="my-project"
                    required
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[#002155]">Technology Stack</span>
                <input
                  value={form.techStack}
                  onChange={(event) => setForm({ ...form, techStack: event.target.value })}
                  className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
                  placeholder="Next.js, Prisma, MySQL, Tailwind CSS"
                  required
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[#002155]">Database Requirement</span>
                  <select
                    value={form.databaseRequired ? 'YES' : 'NO'}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        databaseRequired: event.target.value === 'YES',
                        databaseType: event.target.value === 'YES' ? form.databaseType : 'NONE',
                      })
                    }
                    className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
                  >
                    <option value="NO">No database required</option>
                    <option value="YES">Database required</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[#002155]">Database Type</span>
                  <select
                    value={form.databaseType}
                    onChange={(event) => setForm({ ...form, databaseType: event.target.value as DatabaseType })}
                    disabled={!form.databaseRequired}
                    className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none disabled:bg-[#efeeea] focus:border-[#002155]"
                  >
                    <option value="NONE">None</option>
                    <option value="MYSQL">MySQL</option>
                    <option value="POSTGRESQL">PostgreSQL</option>
                    <option value="MONGODB">MongoDB</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[#002155]">Faculty Mentor Email</span>
                  <input
                    value={form.facultyMentor}
                    onChange={(event) => setForm({ ...form, facultyMentor: event.target.value })}
                    className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[#002155]">Hosting Duration</span>
                  <input
                    value={form.hostingDuration}
                    onChange={(event) => setForm({ ...form, hostingDuration: event.target.value })}
                    className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
                    placeholder="6 months"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[#002155]">Team Members UID - Separate by Commas</span>
                <textarea
                  value={form.teamMembers}
                  onChange={(event) => setForm({ ...form, teamMembers: event.target.value })}
                  rows={3}
                  className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
                  placeholder="List teammate names, roles, or emails"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[#002155]">Additional Notes</span>
                <textarea
                  value={form.additionalNotes}
                  onChange={(event) => setForm({ ...form, additionalNotes: event.target.value })}
                  rows={3}
                  className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
                  placeholder="Anything the hosting team should know before deployment"
                />
              </label>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-[#002155] px-5 py-3 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-60"
                >
                  {saving ? 'Saving...' : editingRequestId ? 'Update Request' : 'Submit Request'}
                </button>
                <button
                  type="button"
                  onClick={() => void refreshData()}
                  disabled={loading}
                  className="border border-[#c4c6d3] px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#434651] disabled:opacity-60"
                >
                  {loading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </form>
          </article>
        </div>

        <div className="space-y-6">
          <article className="border border-[#c4c6d3] bg-white p-5 md:p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-[#8c4f00]">Request Ledger</p>
                <h2 className="mt-1 text-2xl font-headline text-[#002155]">Submitted Requests</h2>
              </div>
              <span className="text-xs uppercase tracking-widest text-[#747782]">{data.requests.length} total</span>
            </div>

            {data.requests.length === 0 ? (
              <p className="border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-4 text-sm text-[#434651]">
                No hosting requests submitted yet.
              </p>
            ) : (
              <div className="space-y-3">
                {data.requests.map((request) => (
                  <button
                    key={request.id}
                    type="button"
                    onClick={() => setSelectedRequestId(request.id)}
                    className={`w-full border p-4 text-left transition-colors ${
                      selectedRequest?.id === request.id ? 'border-[#002155] bg-[#f5f4f0]' : 'border-[#e3e2df] bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-[#002155]">{request.projectName}</p>
                        <p className="mt-1 text-xs text-[#434651]">{request.projectCategory}</p>
                      </div>
                      <HostingRequestStatusBadge status={request.status} />
                    </div>
                    <p className="mt-2 text-xs text-[#747782]">Created {formatDateTime(request.createdAt)}</p>
                    {request.status === 'CHANGES_REQUESTED' ? (
                      <span className="mt-3 inline-flex border border-[#fbbf24] px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-[#92400e]">
                        Editable
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </article>

          {selectedRequest ? (
            <article className="border border-[#c4c6d3] bg-white p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-widest text-[#8c4f00]">Selected Request</p>
                  <h2 className="mt-1 text-2xl font-headline text-[#002155]">{selectedRequest.projectName}</h2>
                </div>
                <HostingRequestStatusBadge status={selectedRequest.status} />
              </div>

              <div className="mt-5 grid gap-3 text-sm text-[#434651]">
                <p><span className="font-semibold text-[#002155]">GitHub:</span> <a className="text-[#8c4f00] underline" href={selectedRequest.githubUrl} target="_blank" rel="noreferrer">{selectedRequest.githubUrl}</a></p>
                <p><span className="font-semibold text-[#002155]">Tech Stack:</span> {selectedRequest.techStack.join(', ') || 'Not provided'}</p>
                <p><span className="font-semibold text-[#002155]">Preferred Subdomain:</span> {selectedRequest.preferredSubdomain || 'Not provided'}</p>
                <p><span className="font-semibold text-[#002155]">Assigned Domain:</span> {selectedRequest.assignedDomain || 'Not assigned yet'}</p>
                <p><span className="font-semibold text-[#002155]">Database:</span> {selectedRequest.databaseRequired ? selectedRequest.databaseType : 'Not required'}</p>
                <p><span className="font-semibold text-[#002155]">Description:</span> {selectedRequest.projectDescription}</p>
                {selectedRequest.adminRemarks ? (
                  <div className="border border-[#f4c95d] bg-[#fffaf0] p-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#8c4f00]">Admin Remarks</p>
                    <p className="mt-2 text-sm text-[#434651]">{selectedRequest.adminRemarks}</p>
                  </div>
                ) : null}
                {selectedRequest.status === 'CHANGES_REQUESTED' ? (
                  <button
                    type="button"
                    onClick={() => handleEdit(selectedRequest)}
                    className="mt-2 w-fit border border-[#002155] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#002155]"
                  >
                    Edit And Resubmit
                  </button>
                ) : null}
              </div>

              <div className="mt-6">
                <h3 className="text-lg font-bold text-[#002155]">Activity Timeline</h3>
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
              </div>
            </article>
          ) : null}
        </div>
      </section>
    </main>
  );
}
