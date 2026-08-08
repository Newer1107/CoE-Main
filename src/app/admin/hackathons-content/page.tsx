'use client';

import { useEffect, useState } from 'react';

type ApiResponse<T> = { success: boolean; message: string; data: T | null };

type Opportunity = {
  id: number;
  title: string;
  category: string;
  organizer: string;
  description: string | null;
  registrationDeadline: string | null;
  eligibility: string | null;
  prize: string | null;
  themes: string[] | null;
  technologies: string[] | null;
  applicationUrl: string | null;
  facultyRecommended: boolean;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
};

type LearningResource = {
  id: number;
  title: string;
  category: string;
  type: string;
  url: string | null;
  fileKey: string | null;
  difficulty: string | null;
  tags: string[] | null;
  createdAt: string;
};

const STATUS_STYLES: Record<Opportunity['status'], string> = {
  PENDING: 'border-[#8a5a00] bg-[#fdf6ec] text-[#8a5a00]',
  APPROVED: 'border-[#0b6b2e] bg-[#f0faf2] text-[#0b6b2e]',
  REJECTED: 'border-[#991b1b] bg-[#fdf2f2] text-[#991b1b]',
};

const RESOURCE_TYPES = ['PDF', 'LINK', 'YOUTUBE', 'GITHUB', 'TEMPLATE', 'WINNING_PROJECT'];

const inputClass =
  'w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]';

export default function HackathonsContentPage() {
  // ── External opportunities moderation ──
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [opportunitiesLoading, setOpportunitiesLoading] = useState(true);
  const [opportunitiesError, setOpportunitiesError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionId, setActionId] = useState<number | null>(null);

  // ── Learning resources ──
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [resourcesError, setResourcesError] = useState('');
  const [resourceForm, setResourceForm] = useState({
    title: '',
    category: '',
    type: 'PDF' as LearningResource['type'],
    url: '',
    difficulty: '',
  });
  const [resourceSaving, setResourceSaving] = useState(false);
  const [resourceMessage, setResourceMessage] = useState('');
  const [resourceError, setResourceError] = useState('');

  const loadOpportunities = async () => {
    try {
      // Admins see all statuses when no status filter is provided.
      const res = await fetch('/api/opportunities', { credentials: 'include' });
      const json = (await res.json()) as ApiResponse<Opportunity[]>;
      if (!json.success) throw new Error(json.message || 'Failed to load opportunities.');
      setOpportunities(json.data ?? []);
    } catch (err) {
      setOpportunitiesError(err instanceof Error ? err.message : 'Failed to load opportunities.');
    } finally {
      setOpportunitiesLoading(false);
    }
  };

  const loadResources = async () => {
    try {
      const res = await fetch('/api/learning-resources', { credentials: 'include' });
      const json = (await res.json()) as ApiResponse<LearningResource[]>;
      if (!json.success) throw new Error(json.message || 'Failed to load learning resources.');
      setResources(json.data ?? []);
    } catch (err) {
      setResourcesError(err instanceof Error ? err.message : 'Failed to load learning resources.');
    } finally {
      setResourcesLoading(false);
    }
  };

  useEffect(() => {
    void loadOpportunities();
    void loadResources();
  }, []);

  const runAction = async (label: string, handler: () => Promise<ApiResponse<unknown>>) => {
    setActionMessage('');
    setActionError('');
    try {
      const json = await handler();
      if (!json.success) throw new Error(json.message || `${label} failed.`);
      setActionMessage(json.message || `${label} succeeded.`);
      void loadOpportunities();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `${label} failed.`);
    }
  };

  const setOpportunityStatus = (opportunity: Opportunity, status: Opportunity['status']) => {
    setActionId(opportunity.id);
    void runAction(`Marked "${opportunity.title}" ${status.toLowerCase()}`, async () => {
      const res = await fetch(`/api/admin/opportunities/${opportunity.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      return (await res.json()) as ApiResponse<unknown>;
    }).finally(() => setActionId(null));
  };

  const deleteOpportunity = (opportunity: Opportunity) => {
    if (!window.confirm(`Delete "${opportunity.title}" permanently?`)) return;
    setActionId(opportunity.id);
    void runAction(`Deleted "${opportunity.title}"`, async () => {
      const res = await fetch(`/api/admin/opportunities/${opportunity.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      return (await res.json()) as ApiResponse<unknown>;
    }).finally(() => setActionId(null));
  };

  const addResource = async () => {
    setResourceMessage('');
    setResourceError('');
    if (!resourceForm.title.trim() || !resourceForm.category.trim()) {
      setResourceError('Title and category are required.');
      return;
    }
    setResourceSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: resourceForm.title.trim(),
        category: resourceForm.category.trim(),
        type: resourceForm.type,
      };
      if (resourceForm.url.trim()) payload.url = resourceForm.url.trim();
      if (resourceForm.difficulty.trim()) payload.difficulty = resourceForm.difficulty.trim();

      const res = await fetch('/api/learning-resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as ApiResponse<unknown>;
      if (!json.success) throw new Error(json.message || 'Failed to add resource.');
      setResourceMessage('Learning resource added.');
      setResourceForm({ title: '', category: '', type: 'PDF', url: '', difficulty: '' });
      void loadResources();
    } catch (err) {
      setResourceError(err instanceof Error ? err.message : 'Failed to add resource.');
    } finally {
      setResourceSaving(false);
    }
  };

  const deleteResource = (resource: LearningResource) => {
    if (!window.confirm(`Delete "${resource.title}"?`)) return;
    setResourceMessage('');
    setResourceError('');
    void (async () => {
      try {
        const res = await fetch(`/api/learning-resources/${resource.id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        const json = (await res.json()) as ApiResponse<unknown>;
        if (!json.success) throw new Error(json.message || 'Failed to delete resource.');
        setResourceMessage(`Deleted "${resource.title}".`);
        void loadResources();
      } catch (err) {
        setResourceError(err instanceof Error ? err.message : 'Failed to delete resource.');
      }
    })();
  };

  const renderBanner = (message: string, error: boolean) =>
    message ? (
      <div
        className={`mb-6 max-w-5xl border p-4 text-sm ${
          error ? 'border-[#991b1b] bg-[#fdf2f2] text-[#991b1b]' : 'border-[#0b6b2e] bg-[#f0faf2] text-[#0b6b2e]'
        }`}
      >
        {message}
      </div>
    ) : null;

  return (
    <main className="mx-auto mt-10 min-h-screen max-w-[1560px] px-4 pb-14 pt-[120px] md:px-8">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl font-bold leading-none tracking-tight text-[#002155] md:text-[40px]">
          Hackathons Content
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[#434651]">
          Moderate external opportunities and manage learning resources for the platform.
        </p>
      </header>

      {renderBanner(actionError, true)}
      {renderBanner(actionMessage, false)}
      {renderBanner(resourceError, true)}
      {renderBanner(resourceMessage, false)}
      {opportunitiesError ? renderBanner(opportunitiesError, true) : null}
      {resourcesError ? renderBanner(resourcesError, true) : null}

      <div className="max-w-5xl space-y-10">
        {/* External Opportunities moderation */}
        <section className="border border-[#c4c6d3] bg-white p-5 md:p-6">
          <h2 className="font-headline text-2xl font-bold text-[#002155]">External Opportunities — Moderation</h2>
          <p className="mt-1 text-xs text-[#747782]">
            Submissions from faculty await approval before they appear on the External Opportunities page.
          </p>

          {opportunitiesLoading ? (
            <p className="mt-4 text-sm text-[#747782]">Loading opportunities…</p>
          ) : opportunities.length === 0 ? (
            <div className="mt-4 border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-8 text-center">
              <p className="text-sm font-semibold text-[#002155]">No opportunities yet</p>
              <p className="mt-1 text-xs text-[#747782]">Faculty submissions will appear here for review.</p>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-[#e3e2df]">
              {opportunities.map((opportunity) => {
                const busy = actionId === opportunity.id;
                return (
                  <li key={opportunity.id} className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-headline text-base font-bold text-[#002155]">{opportunity.title}</h3>
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${STATUS_STYLES[opportunity.status] ?? STATUS_STYLES.PENDING}`}
                          >
                            {opportunity.status}
                          </span>
                          {opportunity.facultyRecommended ? (
                            <span className="rounded-full bg-[#8c4f00] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                              Recommended
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-[#434651]">
                          {opportunity.category} · {opportunity.organizer}
                          {opportunity.registrationDeadline
                            ? ` · Deadline ${new Date(opportunity.registrationDeadline).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
                            : ''}
                        </p>
                        {opportunity.description ? (
                          <p className="mt-1 line-clamp-2 text-xs text-[#747782]">{opportunity.description}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {opportunity.status !== 'APPROVED' ? (
                          <button
                            onClick={() => setOpportunityStatus(opportunity, 'APPROVED')}
                            disabled={busy}
                            className="border border-[#0b6b2e] bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#0b6b2e] hover:bg-[#0b6b2e] hover:text-white disabled:opacity-50"
                          >
                            Approve
                          </button>
                        ) : null}
                        {opportunity.status !== 'REJECTED' ? (
                          <button
                            onClick={() => setOpportunityStatus(opportunity, 'REJECTED')}
                            disabled={busy}
                            className="border border-[#991b1b] bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#991b1b] hover:bg-[#991b1b] hover:text-white disabled:opacity-50"
                          >
                            Reject
                          </button>
                        ) : null}
                        <button
                          onClick={() => deleteOpportunity(opportunity)}
                          disabled={busy}
                          className="border border-[#434651] bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#434651] hover:bg-[#002155] hover:border-[#002155] hover:text-white disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Learning Resources */}
        <section className="border border-[#c4c6d3] bg-white p-5 md:p-6">
          <h2 className="font-headline text-2xl font-bold text-[#002155]">Learning Resources</h2>
          <p className="mt-1 text-xs text-[#747782]">
            Resources shown on the Learning Hub, grouped by category. Uploads with a file key are linked via the platform.
          </p>

          <div className="mt-5 grid gap-4 border border-[#e3e2df] bg-[#f5f4f0] p-4 md:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <label htmlFor="lr-title" className="mb-2 block text-sm font-medium text-[#002155]">
                Title *
              </label>
              <input
                id="lr-title"
                value={resourceForm.title}
                onChange={(e) => setResourceForm({ ...resourceForm, title: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="lr-category" className="mb-2 block text-sm font-medium text-[#002155]">
                Category *
              </label>
              <input
                id="lr-category"
                value={resourceForm.category}
                onChange={(e) => setResourceForm({ ...resourceForm, category: e.target.value })}
                placeholder="e.g. Design, AI"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="lr-type" className="mb-2 block text-sm font-medium text-[#002155]">
                Type
              </label>
              <select
                id="lr-type"
                value={resourceForm.type}
                onChange={(e) => setResourceForm({ ...resourceForm, type: e.target.value as LearningResource['type'] })}
                className={inputClass}
              >
                {RESOURCE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="lr-url" className="mb-2 block text-sm font-medium text-[#002155]">
                URL
              </label>
              <input
                id="lr-url"
                type="url"
                value={resourceForm.url}
                onChange={(e) => setResourceForm({ ...resourceForm, url: e.target.value })}
                placeholder="https://…"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="lr-difficulty" className="mb-2 block text-sm font-medium text-[#002155]">
                Difficulty
              </label>
              <input
                id="lr-difficulty"
                value={resourceForm.difficulty}
                onChange={(e) => setResourceForm({ ...resourceForm, difficulty: e.target.value })}
                placeholder="e.g. BEGINNER"
                className={inputClass}
              />
            </div>
            <div className="md:col-span-2 lg:col-span-6">
              <button
                onClick={() => void addResource()}
                disabled={resourceSaving}
                className="bg-[#002155] px-4 py-3 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-60"
              >
                {resourceSaving ? 'Adding…' : 'Add Resource'}
              </button>
            </div>
          </div>

          {resourcesLoading ? (
            <p className="mt-4 text-sm text-[#747782]">Loading resources…</p>
          ) : resources.length === 0 ? (
            <div className="mt-4 border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-8 text-center">
              <p className="text-sm font-semibold text-[#002155]">No resources yet</p>
              <p className="mt-1 text-xs text-[#747782]">Add the first learning resource above.</p>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-[#e3e2df]">
              {resources.map((resource) => (
                <li key={resource.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-headline text-sm font-bold text-[#002155]">{resource.title}</h3>
                      <span className="rounded-full border border-[#c4c6d3] bg-[#efeeea] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#434651]">
                        {resource.type}
                      </span>
                      {resource.difficulty ? (
                        <span className="rounded-full border border-[#c4c6d3] bg-[#f5f4f0] px-2.5 py-0.5 text-[11px] text-[#434651]">
                          {resource.difficulty}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-[#747782]">
                      {resource.category}
                      {resource.url ? ` · ${resource.url}` : ''}
                      {resource.fileKey ? ' · file attached' : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteResource(resource)}
                    className="border border-[#991b1b] bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#991b1b] hover:bg-[#991b1b] hover:text-white"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
