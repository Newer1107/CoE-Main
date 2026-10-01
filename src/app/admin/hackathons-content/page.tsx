'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

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
  mode: string | null;
  city: string | null;
  venue: string | null;
  startDate: string | null;
  endDate: string | null;
  verificationStatus: string | null;
  sourceType: string | null;
  showInHub: boolean;
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

  // ── Hackathon Hub pipeline ──
  type HubStats = { totalEvents: number; active: number; closingSoon: number; needsReview: number; expired: number; newThisWeek: number };
  type HubCandidate = { id: number; url: string; source: string; sourceType: string; status: string; title: string | null; confidence: number | null; error: string | null; discoveredAt: string };
  type HubSource = { key: string; label: string; method: string; frequency: string; priority: number; enabled: boolean };
  const [hubStats, setHubStats] = useState<HubStats | null>(null);
  const [candidates, setCandidates] = useState<HubCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [queueFilter, setQueueFilter] = useState('NEEDS_REVIEW,VERIFIED,NEEDS_UPDATE');
  const [sources, setSources] = useState<HubSource[]>([]);
  const [importText, setImportText] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState('');
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineResult, setPipelineResult] = useState('');

  const runPipeline = async () => {
    setPipelineRunning(true);
    setPipelineResult('');
    try {
      const res = await fetch('/api/cron/hub?job=all', { credentials: 'include' });
      const json = (await res.json()) as ApiResponse<Record<string, unknown>>;
      if (!json.success) throw new Error(json.message || 'Pipeline failed.');
      const d = json.data ?? {};
      const fmt = (v: unknown) => {
        if (typeof v === 'object' && v !== null) {
          const o = v as Record<string, unknown>;
          if ('skipped' in o) return 'skipped';
          return Object.entries(o)
            .filter(([, val]) => typeof val === 'number')
            .map(([k, val]) => `${k} ${val}`)
            .join(', ');
        }
        return '';
      };
      setPipelineResult(
        `Discovery [${fmt(d.discovery)}] · Extraction [${fmt(d.extraction)}] · Monitor [${fmt(d.monitor)}] · Closing-soon [${fmt(d.closingSoon)}]`
      );
      void loadHub();
    } catch (err) {
      setPipelineResult(err instanceof Error ? err.message : 'Pipeline failed.');
    } finally {
      setPipelineRunning(false);
    }
  };

  const loadHub = useCallback(async (statusFilter?: string) => {
    try {
      const queue = statusFilter ?? queueFilter;
      const [statsRes, candRes, srcRes] = await Promise.all([
        fetch('/api/admin/hub/stats', { credentials: 'include' }),
        fetch(`/api/admin/hub/candidates${queue ? `?status=${encodeURIComponent(queue)}` : ''}`, { credentials: 'include' }),
        fetch('/api/admin/hub/sources', { credentials: 'include' }),
      ]);
      const statsJson = (await statsRes.json()) as ApiResponse<HubStats>;
      const candJson = (await candRes.json()) as ApiResponse<HubCandidate[]>;
      const srcJson = (await srcRes.json()) as ApiResponse<HubSource[]>;
      if (statsJson.success) setHubStats(statsJson.data);
      if (candJson.success) setCandidates(candJson.data ?? []);
      if (srcJson.success) setSources(srcJson.data ?? []);
    } catch {
      /* hub panels stay empty on failure */
    } finally {
      setCandidatesLoading(false);
    }
  }, [queueFilter]);

  const candidateAction = (candidate: HubCandidate, action: 'verify' | 'reject' | 'publish') => {
    setActionId(candidate.id);
    void runAction(`Candidate ${action}d`, async () => {
      const res = await fetch(`/api/admin/hub/candidates/${candidate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      });
      return (await res.json()) as ApiResponse<unknown>;
    })
      .then(() => void loadHub())
      .finally(() => setActionId(null));
  };

  const runImport = async () => {
    setActionMessage('');
    setActionError('');
    setImportResult('');
    if (!importText.trim() && !sheetUrl.trim()) {
      setActionError('Paste CSV text or a Google Sheet CSV-export URL.');
      return;
    }
    setImporting(true);
    try {
      const res = await fetch('/api/admin/hub/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ csvText: importText || undefined, sheetUrl: sheetUrl.trim() || undefined }),
      });
      const json = (await res.json()) as ApiResponse<{ inserted: number; updated: number; rejected: number; published: number; errors: string[] }>;
      if (!json.success) throw new Error(json.message || 'Import failed.');
      const r = json.data;
      setImportResult(
        r ? `Inserted ${r.inserted} · Updated ${r.updated} · Rejected ${r.rejected} · Published ${r.published}${r.errors?.length ? ` · First issue: ${r.errors[0]}` : ''}` : 'Import completed.'
      );
      setActionMessage('Import completed.');
      void loadHub();
      void loadOpportunities();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const toggleSource = (source: HubSource) => {
    void (async () => {
      const res = await fetch('/api/admin/hub/sources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key: source.key, enabled: !source.enabled }),
      });
      const json = (await res.json()) as ApiResponse<unknown>;
      if (json.success) void loadHub();
    })();
  };

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
    void loadHub();
  }, [loadHub]);

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

  const verifyOpportunity = (opportunity: Opportunity) => {
    setActionId(opportunity.id);
    void runAction(`Verified "${opportunity.title}"`, async () => {
      const res = await fetch(`/api/admin/opportunities/${opportunity.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ verificationStatus: 'ADMIN_VERIFIED' }),
      });
      return (await res.json()) as ApiResponse<unknown>;
    }).finally(() => setActionId(null));
  };

  const toggleHub = (opportunity: Opportunity) => {
    setActionId(opportunity.id);
    void runAction(`"${opportunity.title}" ${opportunity.showInHub ? 'hidden from Hub' : 'shown in Hub'}`, async () => {
      const res = await fetch(`/api/admin/opportunities/${opportunity.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ showInHub: !opportunity.showInHub }),
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
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8c4f00]">
          <Link href="/admin" className="hover:underline">← Admin Panel</Link>
          <span className="mx-2 text-[#c4c6d3]">|</span>
          <Link href="/innovation/hackathon-hub" className="hover:underline">Student Hub →</Link>
        </p>
        <h1 className="mt-2 font-headline text-3xl font-bold leading-none tracking-tight text-[#002155] md:text-[40px]">
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

      <div className="mx-auto max-w-7xl space-y-10">
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
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 lg:flex-1">
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
                          {opportunity.showInHub ? (
                            <span className="rounded-full bg-[#002155] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                              In Hub
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
                      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:shrink-0">
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
                        {opportunity.verificationStatus !== 'ADMIN_VERIFIED' &&
                        opportunity.verificationStatus !== 'VERIFIED' ? (
                          <button
                            onClick={() => verifyOpportunity(opportunity)}
                            disabled={busy}
                            className="border border-[#002155] bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#002155] hover:bg-[#002155] hover:text-white disabled:opacity-50"
                          >
                            Verify
                          </button>
                        ) : null}
                        <button
                          onClick={() => toggleHub(opportunity)}
                          disabled={busy}
                          title={opportunity.showInHub ? 'Hide from Hackathon Hub' : 'Show in Hackathon Hub'}
                          className={`border px-3 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-50 ${
                            opportunity.showInHub
                              ? 'border-[#002155] bg-[#002155] text-white hover:bg-white hover:text-[#002155]'
                              : 'border-[#002155] bg-white text-[#002155] hover:bg-[#002155] hover:text-white'
                          }`}
                        >
                          {opportunity.showInHub ? 'In Hub ✓' : 'Hub?'}
                        </button>
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

        {/* Hackathon Hub — dashboard (§39) */}
        <section className="border border-[#c4c6d3] bg-white p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="font-headline text-2xl font-bold text-[#002155]">Hackathon Hub — Dashboard</h2>
            <div className="flex items-center gap-3">
              {pipelineResult ? <p className="max-w-md text-xs text-[#434651]">{pipelineResult}</p> : null}
              <button
                onClick={() => void runPipeline()}
                disabled={pipelineRunning}
                title="Run discovery → extraction → monitor → closing-soon now"
                className="bg-[#8c4f00] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:opacity-90 disabled:opacity-60"
              >
                {pipelineRunning ? 'Running…' : 'Run pipeline now'}
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-[#747782]">
            Automated schedule: full pipeline daily 02:00 AM IST, closing-soon reminders every 6h (GitHub Actions `hub-pipeline.yml`).
          </p>
          {hubStats ? (
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
              {[
                ['Total', hubStats.totalEvents],
                ['Active', hubStats.active],
                ['Closing Soon', hubStats.closingSoon],
                ['Needs Review', hubStats.needsReview],
                ['Expired', hubStats.expired],
                ['New This Week', hubStats.newThisWeek],
              ].map(([label, value]) => (
                <div key={label} className="border border-[#e3e2df] bg-[#f5f4f0] p-3 text-center">
                  <p className="font-headline text-2xl font-bold text-[#002155]">{value}</p>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#747782]">{label}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[#747782]">Loading hub stats…</p>
          )}
        </section>

        {/* Hackathon Hub — review queue (§18, §40 monthly workflow) */}
        <section className="border border-[#c4c6d3] bg-white p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-headline text-2xl font-bold text-[#002155]">Hub Review Queue</h2>
            <label className="flex items-center gap-2 text-xs text-[#434651]">
              Show
              <select
                value={queueFilter}
                onChange={(e) => { const v = e.target.value; setQueueFilter(v); setCandidatesLoading(true); void loadHub(v); }}
                className="border border-[#c4c6d3] bg-white px-2 py-1.5 text-xs outline-none focus:border-[#002155]"
              >
                <option value="NEEDS_REVIEW,VERIFIED,NEEDS_UPDATE">Actionable</option>
                <option value="">All</option>
                <option value="DISCOVERED">Discovered</option>
                <option value="NEEDS_REVIEW">Needs review</option>
                <option value="VERIFIED">Verified</option>
                <option value="NEEDS_UPDATE">Needs update</option>
                <option value="PUBLISHED">Published</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </label>
          </div>
          <p className="mt-1 text-xs text-[#747782]">
            Verify important fields, then publish — verified rows stay here until published. Run <span className="font-mono">GET /api/cron/hub?job=all</span> daily (or via scheduler) for discovery → extraction → monitoring.
          </p>
          {candidatesLoading ? (
            <p className="mt-4 text-sm text-[#747782]">Loading candidates…</p>
          ) : candidates.length === 0 ? (
            <p className="mt-4 border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-6 text-center text-sm text-[#747782]">
              Queue is clear — new discoveries will appear here.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[#e3e2df]">
              {candidates.map((candidate) => {
                const busy = actionId === candidate.id;
                return (
                  <li key={candidate.id} className="py-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 lg:flex-1">
                        <h3 className="font-headline text-base font-bold text-[#002155]">{candidate.title ?? candidate.url}</h3>
                        <p className="mt-1 break-all text-xs text-[#434651]">
                          {candidate.source} · {candidate.sourceType} · {candidate.status}
                          {candidate.confidence != null ? ` · confidence ${candidate.confidence}` : ''}
                        </p>
                        {candidate.error ? <p className="mt-1 text-xs text-[#991b1b]">{candidate.error}</p> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:shrink-0">
                        <button onClick={() => candidateAction(candidate, 'verify')} disabled={busy} className="border border-[#0b6b2e] bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#0b6b2e] hover:bg-[#0b6b2e] hover:text-white disabled:opacity-50">
                          Verify
                        </button>
                        <button onClick={() => candidateAction(candidate, 'publish')} disabled={busy} className="bg-[#002155] px-3 py-2 text-xs font-bold uppercase tracking-wider text-white hover:opacity-90 disabled:opacity-50">
                          Publish
                        </button>
                        <button onClick={() => candidateAction(candidate, 'reject')} disabled={busy} className="border border-[#991b1b] bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#991b1b] hover:bg-[#991b1b] hover:text-white disabled:opacity-50">
                          Reject
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Hackathon Hub — Sheet/CSV import (§24) */}
        <section className="border border-[#c4c6d3] bg-white p-5 md:p-6">
          <h2 className="font-headline text-2xl font-bold text-[#002155]">Hub Import — Sheet / CSV</h2>
          <p className="mt-1 text-xs text-[#747782]">
            Paste CSV text (header row: eventName, organiser, startDate, registrationDeadline, mode, city, …) or a Google Sheet CSV-export URL (File → Share → Publish to web → CSV). Admin imports publish immediately; conflicts with verified rows are flagged, never overwritten.
          </p>
          <input
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/…/export?format=csv"
            className={inputClass + ' mt-4'}
          />
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={4}
            placeholder="eventName,organiser,startDate,registrationDeadline,mode,city,registrationUrl"
            className={inputClass + ' mt-3 font-mono'}
          />
          <div className="mt-3 flex items-center gap-4">
            <button onClick={() => void runImport()} disabled={importing} className="bg-[#002155] px-4 py-3 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-60">
              {importing ? 'Importing…' : 'Run Import'}
            </button>
            {importResult ? <p className="text-xs text-[#434651]">{importResult}</p> : null}
          </div>
        </section>

        {/* Hackathon Hub — sources (§8) */}
        <section className="border border-[#c4c6d3] bg-white p-5 md:p-6">
          <h2 className="font-headline text-2xl font-bold text-[#002155]">Hub Sources</h2>
          <p className="mt-1 text-xs text-[#747782]">Toggle discovery sources. PAGE seeds are crawled by the discover job; MANUAL sources accept pasted URLs and CSV rows.</p>
          <ul className="mt-4 divide-y divide-[#e3e2df]">
            {sources.map((source) => (
              <li key={source.key} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div>
                  <p className="text-sm font-bold text-[#002155]">{source.label}</p>
                  <p className="text-xs text-[#747782]">{source.method} · {source.frequency} · priority {source.priority}</p>
                </div>
                <button onClick={() => toggleSource(source)} className={`border px-3 py-2 text-xs font-bold uppercase tracking-wider ${source.enabled ? 'border-[#0b6b2e] text-[#0b6b2e]' : 'border-[#c4c6d3] text-[#747782]'}`}>
                  {source.enabled ? 'Enabled' : 'Disabled'}
                </button>
              </li>
            ))}
          </ul>
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
