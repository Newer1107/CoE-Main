'use client';

import { useEffect, useMemo, useState } from 'react';

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
  status: string;
  createdAt: string;
  myInterest: { status: 'SAVED' | 'INTERESTED' } | null;
};

type SortMode = 'deadline' | 'newest';

const daysUntil = (iso: string | null): number | null => {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  return Math.ceil((time - Date.now()) / 86_400_000);
};

const formatDeadline = (iso: string | null): string => {
  if (!iso) return 'No deadline';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'No deadline';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const parseList = (raw: string): string[] =>
  raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const inputClass =
  'w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]';

export default function ExternalOpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('newest');
  const [activeCategory, setActiveCategory] = useState('All');

  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [form, setForm] = useState({
    title: '',
    category: '',
    organizer: '',
    description: '',
    eligibility: '',
    prize: '',
    applicationUrl: '',
    registrationDeadline: '',
    themes: '',
    technologies: '',
    facultyRecommended: false,
  });

  const load = async () => {
    try {
      const res = await fetch('/api/opportunities', { credentials: 'include' });
      const json = (await res.json()) as ApiResponse<Opportunity[]>;
      if (!json.success) throw new Error(json.message || 'Failed to load opportunities.');
      setOpportunities(json.data ?? []);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load opportunities.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const opportunity of opportunities) {
      if (opportunity.category) set.add(opportunity.category);
    }
    return ['All', ...Array.from(set).sort()];
  }, [opportunities]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = opportunities.filter((opportunity) => {
      if (activeCategory !== 'All' && opportunity.category !== activeCategory) return false;
      if (!query) return true;
      return (
        opportunity.title.toLowerCase().includes(query) ||
        opportunity.organizer.toLowerCase().includes(query) ||
        (opportunity.description ?? '').toLowerCase().includes(query)
      );
    });
    const sorted = [...filtered];
    if (sort === 'deadline') {
      sorted.sort((a, b) => {
        const aTime = a.registrationDeadline ? new Date(a.registrationDeadline).getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.registrationDeadline ? new Date(b.registrationDeadline).getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      });
    } else {
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return sorted;
  }, [opportunities, search, sort, activeCategory]);

  const setInterest = async (opportunity: Opportunity, status: 'SAVED' | 'INTERESTED') => {
    setErrorMessage('');
    try {
      const res = await fetch(`/api/opportunities/${opportunity.id}/interest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      const json = (await res.json()) as ApiResponse<unknown>;
      if (!json.success) {
        if (res.status === 401) throw new Error('Sign in as a student to save opportunities.');
        if (res.status === 403) throw new Error('Only students can save or express interest.');
        throw new Error(json.message || 'Failed to update interest.');
      }
      setOpportunities((prev) =>
        prev.map((item) => (item.id === opportunity.id ? { ...item, myInterest: { status } } : item)),
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update interest.');
    }
  };

  const clearInterest = async (opportunity: Opportunity) => {
    setErrorMessage('');
    try {
      const res = await fetch(`/api/opportunities/${opportunity.id}/interest`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = (await res.json()) as ApiResponse<unknown>;
      if (!json.success) {
        if (res.status === 401) throw new Error('Sign in as a student to manage saved opportunities.');
        if (res.status === 403) throw new Error('Only students can manage saved opportunities.');
        throw new Error(json.message || 'Failed to remove interest.');
      }
      setOpportunities((prev) =>
        prev.map((item) => (item.id === opportunity.id ? { ...item, myInterest: null } : item)),
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to remove interest.');
    }
  };

  const handleSubmit = async () => {
    setSubmitError('');
    setSubmitSuccess('');
    if (!form.title.trim() || !form.category.trim() || !form.organizer.trim()) {
      setSubmitError('Title, category and organizer are required.');
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        category: form.category.trim(),
        organizer: form.organizer.trim(),
        facultyRecommended: form.facultyRecommended,
      };
      if (form.description.trim()) payload.description = form.description.trim();
      if (form.eligibility.trim()) payload.eligibility = form.eligibility.trim();
      if (form.prize.trim()) payload.prize = form.prize.trim();
      if (form.applicationUrl.trim()) payload.applicationUrl = form.applicationUrl.trim();
      if (form.registrationDeadline) payload.registrationDeadline = form.registrationDeadline;
      const themes = parseList(form.themes);
      if (themes.length > 0) payload.themes = themes;
      const technologies = parseList(form.technologies);
      if (technologies.length > 0) payload.technologies = technologies;

      const res = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as ApiResponse<unknown>;
      if (!json.success) {
        if (res.status === 401) throw new Error('Sign in as faculty or admin to submit opportunities.');
        if (res.status === 403) throw new Error('Faculty/Admin only — you need faculty or admin access to submit opportunities.');
        throw new Error(json.message || 'Failed to submit opportunity.');
      }
      setSubmitSuccess('Opportunity submitted — it will appear once approved by an admin.');
      setForm({
        title: '',
        category: '',
        organizer: '',
        description: '',
        eligibility: '',
        prize: '',
        applicationUrl: '',
        registrationDeadline: '',
        themes: '',
        technologies: '',
        facultyRecommended: false,
      });
      setSubmitOpen(false);
      void load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit opportunity.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-[1560px] px-4 pb-14 md:px-8">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl font-bold leading-none tracking-tight text-[#002155] md:text-[40px]">
          External Opportunities
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[#434651]">
          Hackathons, competitions, workshops &amp; more — curated from outside the campus.
        </p>
      </header>

      {errorMessage ? (
        <div className="mb-6 max-w-4xl border border-[#991b1b] bg-[#fdf2f2] p-4 text-sm text-[#991b1b]">{errorMessage}</div>
      ) : null}
      {submitError ? (
        <div className="mb-6 max-w-4xl border border-[#991b1b] bg-[#fdf2f2] p-4 text-sm text-[#991b1b]">{submitError}</div>
      ) : null}
      {submitSuccess ? (
        <div className="mb-6 max-w-4xl border border-[#0b6b2e] bg-[#f0faf2] p-4 text-sm text-[#0b6b2e]">{submitSuccess}</div>
      ) : null}

      {/* Controls */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                activeCategory === category
                  ? 'border-[#002155] bg-[#002155] text-white'
                  : 'border-[#c4c6d3] bg-white text-[#434651] hover:border-[#002155] hover:text-[#002155]'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search opportunities…"
            className="w-full border border-[#c4c6d3] bg-white px-3 py-2 text-sm text-[#434651] outline-none focus:border-[#002155] sm:w-64"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="border border-[#c4c6d3] bg-white px-3 py-2 text-sm text-[#434651] outline-none focus:border-[#002155]"
          >
            <option value="newest">Newest first</option>
            <option value="deadline">Deadline soonest</option>
          </select>
          <button
            onClick={() => setSubmitOpen((open) => !open)}
            className="border border-[#002155] bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#002155] hover:bg-[#002155] hover:text-white"
          >
            Submit Opportunity
          </button>
        </div>
      </div>

      {/* Submit form */}
      {submitOpen ? (
        <section className="mb-8 max-w-4xl border border-[#c4c6d3] bg-white p-5 md:p-6">
          <h2 className="font-headline text-2xl font-bold text-[#002155]">Submit an Opportunity</h2>
          <p className="mt-1 text-xs text-[#747782]">
            Faculty and admins can submit opportunities for review — submissions go live once approved.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="opp-title" className="mb-2 block text-sm font-medium text-[#002155]">
                Title *
              </label>
              <input
                id="opp-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="opp-category" className="mb-2 block text-sm font-medium text-[#002155]">
                Category *
              </label>
              <input
                id="opp-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. Hackathon, Workshop, Competition"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="opp-organizer" className="mb-2 block text-sm font-medium text-[#002155]">
                Organizer *
              </label>
              <input
                id="opp-organizer"
                value={form.organizer}
                onChange={(e) => setForm({ ...form, organizer: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="opp-deadline" className="mb-2 block text-sm font-medium text-[#002155]">
                Registration Deadline
              </label>
              <input
                id="opp-deadline"
                type="date"
                value={form.registrationDeadline}
                onChange={(e) => setForm({ ...form, registrationDeadline: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="opp-description" className="mb-2 block text-sm font-medium text-[#002155]">
                Description
              </label>
              <textarea
                id="opp-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="opp-prize" className="mb-2 block text-sm font-medium text-[#002155]">
                Prize
              </label>
              <input
                id="opp-prize"
                value={form.prize}
                onChange={(e) => setForm({ ...form, prize: e.target.value })}
                placeholder="e.g. ₹50,000 + incubation"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="opp-eligibility" className="mb-2 block text-sm font-medium text-[#002155]">
                Eligibility
              </label>
              <input
                id="opp-eligibility"
                value={form.eligibility}
                onChange={(e) => setForm({ ...form, eligibility: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="opp-url" className="mb-2 block text-sm font-medium text-[#002155]">
                Application URL
              </label>
              <input
                id="opp-url"
                type="url"
                value={form.applicationUrl}
                onChange={(e) => setForm({ ...form, applicationUrl: e.target.value })}
                placeholder="https://…"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="opp-themes" className="mb-2 block text-sm font-medium text-[#002155]">
                Themes
              </label>
              <input
                id="opp-themes"
                value={form.themes}
                onChange={(e) => setForm({ ...form, themes: e.target.value })}
                placeholder="comma-separated, e.g. AI, Climate"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="opp-tech" className="mb-2 block text-sm font-medium text-[#002155]">
                Technologies
              </label>
              <input
                id="opp-tech"
                value={form.technologies}
                onChange={(e) => setForm({ ...form, technologies: e.target.value })}
                placeholder="comma-separated, e.g. React, Python"
                className={inputClass}
              />
            </div>
            <div className="md:col-span-2">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.facultyRecommended}
                  onChange={(e) => setForm({ ...form, facultyRecommended: e.target.checked })}
                  className="h-4 w-4 accent-[#002155]"
                />
                <span className="text-sm font-medium text-[#002155]">Faculty recommended</span>
              </label>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-4">
            <button
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="bg-[#002155] px-4 py-3 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Submit for Review'}
            </button>
            <button
              onClick={() => setSubmitOpen(false)}
              className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#747782] hover:text-[#002155]"
            >
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {loading ? (
        <p className="text-sm text-[#747782]">Loading opportunities…</p>
      ) : visible.length === 0 ? (
        <div className="border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-10 text-center">
          <p className="font-headline text-xl font-bold text-[#002155]">No opportunities found</p>
          <p className="mt-1 text-sm text-[#747782]">
            {opportunities.length === 0
              ? 'Opportunities curated by faculty and admins will appear here.'
              : 'Try a different search, category or sort.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((opportunity) => {
            const days = daysUntil(opportunity.registrationDeadline);
            const saved = opportunity.myInterest?.status === 'SAVED';
            const interested = opportunity.myInterest?.status === 'INTERESTED';
            return (
              <article key={opportunity.id} className="flex flex-col border border-[#c4c6d3] bg-white p-5 md:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-[#002155] bg-[#f0f2fa] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#002155]">
                    {opportunity.category}
                  </span>
                  {opportunity.facultyRecommended ? (
                    <span className="rounded-full bg-[#8c4f00] px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
                      ★ Faculty Recommended
                    </span>
                  ) : null}
                </div>

                <h3 className="mt-3 font-headline text-xl font-bold leading-snug text-[#002155]">{opportunity.title}</h3>
                <p className="mt-1 text-sm text-[#434651]">by {opportunity.organizer}</p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-[#8c4f00] bg-[#fdf6ec] px-3 py-1 text-xs font-semibold text-[#8c4f00]">
                    {opportunity.registrationDeadline
                      ? `${formatDeadline(opportunity.registrationDeadline)} · ${days != null && days >= 0 ? `${days} day${days === 1 ? '' : 's'} left` : 'Deadline passed'}`
                      : 'No deadline'}
                  </span>
                  {opportunity.prize ? (
                    <span className="rounded-full border border-[#c4c6d3] bg-[#efeeea] px-3 py-1 text-xs font-semibold text-[#434651]">
                      Prize: {opportunity.prize}
                    </span>
                  ) : null}
                </div>

                {opportunity.themes && opportunity.themes.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {opportunity.themes.map((theme) => (
                      <span key={theme} className="rounded-full border border-[#c4c6d3] bg-[#efeeea] px-2.5 py-0.5 text-[11px] text-[#434651]">
                        {theme}
                      </span>
                    ))}
                  </div>
                ) : null}
                {opportunity.technologies && opportunity.technologies.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {opportunity.technologies.map((technology) => (
                      <span
                        key={technology}
                        className="rounded-full border border-[#c4c6d3] bg-[#f5f4f0] px-2.5 py-0.5 text-[11px] text-[#434651]"
                      >
                        {technology}
                      </span>
                    ))}
                  </div>
                ) : null}

                {opportunity.description ? (
                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-[#434651]">{opportunity.description}</p>
                ) : null}

                <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
                  {opportunity.applicationUrl ? (
                    <a
                      href={opportunity.applicationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-[#002155] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:opacity-90"
                    >
                      Apply
                    </a>
                  ) : (
                    <span className="border border-[#c4c6d3] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#747782]">
                      Apply via organizer
                    </span>
                  )}
                  <button
                    onClick={() => void (saved ? clearInterest(opportunity) : setInterest(opportunity, 'SAVED'))}
                    className={`border px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                      saved
                        ? 'border-[#002155] bg-[#002155] text-white'
                        : 'border-[#002155] bg-white text-[#002155] hover:bg-[#f0f2fa]'
                    }`}
                  >
                    {saved ? '✓ Bookmarked' : 'Bookmark'}
                  </button>
                  <button
                    onClick={() => void (interested ? clearInterest(opportunity) : setInterest(opportunity, 'INTERESTED'))}
                    className={`border px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                      interested
                        ? 'border-[#8c4f00] bg-[#8c4f00] text-white'
                        : 'border-[#8c4f00] bg-white text-[#8c4f00] hover:bg-[#fdf6ec]'
                    }`}
                  >
                    {interested ? '✓ Interested' : 'Interested'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
