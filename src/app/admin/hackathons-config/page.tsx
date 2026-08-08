'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PlatformConfig } from '@/lib/platform-config';

type ApiResponse<T> = { success: boolean; message: string; data: T };

type SettingInput = {
  key: string;
  value: unknown;
  group: string;
  label: string;
  description?: string;
};

type FormState = {
  platformName: string;
  featuredEvents: string; // comma-separated ids
  departments: string; // comma-separated
  tags: string; // comma-separated
  flags: PlatformConfig['flags'];
};

const FLAG_FIELDS: Array<{ key: keyof PlatformConfig['flags']; label: string; description: string }> = [
  { key: 'certificates', label: 'Certificates', description: 'Issue certificates for completed events.' },
  { key: 'tickets', label: 'Tickets', description: 'Enable ticketing / seat registration for events.' },
  { key: 'externalRepo', label: 'External Repository', description: 'Allow linking external code repositories to submissions.' },
  { key: 'learningHub', label: 'Learning Hub', description: 'Enable the learning hub section of the platform.' },
];

const parseIdList = (raw: string): number[] =>
  raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => Number(part))
    .filter((n) => Number.isFinite(n));

const parseStringList = (raw: string): string[] =>
  raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const fromConfig = (config: PlatformConfig): FormState => ({
  platformName: config.identity.platformName,
  featuredEvents: config.identity.featuredEvents.join(', '),
  departments: config.taxonomy.departments.join(', '),
  tags: config.taxonomy.tags.join(', '),
  flags: { ...config.flags },
});

const collectChangedSettings = (form: FormState, initial: FormState | null): SettingInput[] => {
  if (!initial) return [];

  const settings: SettingInput[] = [];

  if (form.platformName.trim() !== initial.platformName.trim()) {
    settings.push({
      key: 'identity.platformName',
      value: form.platformName.trim(),
      group: 'identity',
      label: 'Platform Name',
    });
  }

  const featuredEvents = parseIdList(form.featuredEvents);
  if (featuredEvents.join(',') !== parseIdList(initial.featuredEvents).join(',')) {
    settings.push({
      key: 'identity.featuredEvents',
      value: featuredEvents,
      group: 'identity',
      label: 'Featured Event IDs',
      description: 'Comma-separated event IDs featured on the platform home page.',
    });
  }

  const departments = parseStringList(form.departments);
  if (departments.join(',') !== parseStringList(initial.departments).join(',')) {
    settings.push({
      key: 'taxonomy.departments',
      value: departments,
      group: 'taxonomy',
      label: 'Departments',
      description: 'Departments that participate on the platform.',
    });
  }

  const tags = parseStringList(form.tags);
  if (tags.join(',') !== parseStringList(initial.tags).join(',')) {
    settings.push({
      key: 'taxonomy.tags',
      value: tags,
      group: 'taxonomy',
      label: 'Tags',
      description: 'Platform-wide tags for categorising events.',
    });
  }

  for (const field of FLAG_FIELDS) {
    if (form.flags[field.key] !== initial.flags[field.key]) {
      settings.push({
        key: `flags.${field.key}`,
        value: form.flags[field.key],
        group: 'flags',
        label: field.label,
      });
    }
  }

  return settings;
};

export default function HackathonsConfigPage() {
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [initial, setInitial] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/hackathons-config', { credentials: 'include' });
        const json = (await res.json()) as ApiResponse<PlatformConfig>;
        if (!json.success) throw new Error(json.message || 'Failed to load configuration.');
        if (!cancelled) {
          setConfig(json.data);
          const loaded = fromConfig(json.data);
          setForm(loaded);
          setInitial(loaded);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : 'Failed to load configuration.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const changedCount = useMemo(
    () => (form && initial ? collectChangedSettings(form, initial).length : 0),
    [form, initial],
  );

  const handleSave = async () => {
    if (!form || !initial) return;

    const settings = collectChangedSettings(form, initial);
    if (settings.length === 0) {
      setStatusMessage('No changes to save.');
      return;
    }

    setSaving(true);
    setStatusMessage('');
    setErrorMessage('');
    try {
      const res = await fetch('/api/admin/hackathons-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ settings }),
      });
      const json = (await res.json()) as ApiResponse<PlatformConfig>;
      if (!json.success) throw new Error(json.message || 'Failed to save configuration.');

      setConfig(json.data);
      const refreshed = fromConfig(json.data);
      setForm(refreshed);
      setInitial(refreshed);
      setStatusMessage(`Saved ${settings.length} setting(s).`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  const setFlag = (key: keyof PlatformConfig['flags'], value: boolean) => {
    setForm((prev) => (prev ? { ...prev, flags: { ...prev.flags, [key]: value } } : prev));
  };

  return (
    <main className="max-w-[1560px] mx-auto mt-10 px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          Platform Configuration
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl text-sm">
          Site-level settings for the Innovation &amp; Competitions platform. Changes take effect immediately.
        </p>
      </header>

      {errorMessage ? (
        <div className="mb-6 max-w-4xl border border-[#991b1b] bg-[#fdf2f2] p-4 text-sm text-[#991b1b]">
          {errorMessage}
        </div>
      ) : null}
      {statusMessage ? (
        <div className="mb-6 max-w-4xl border border-[#0b6b2e] bg-[#f0faf2] p-4 text-sm text-[#0b6b2e]">
          {statusMessage}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-[#747782]">Loading configuration…</p>
      ) : form ? (
        <div className="max-w-4xl space-y-6">
          {/* Identity */}
          <section className="border border-[#c4c6d3] bg-white p-5 md:p-6">
            <h2 className="text-2xl font-headline text-[#002155]">Identity</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="platform-name" className="mb-2 block text-sm font-medium text-[#002155]">
                  Platform Name
                </label>
                <input
                  id="platform-name"
                  value={form.platformName}
                  onChange={(e) => setForm({ ...form, platformName: e.target.value })}
                  className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
                />
              </div>
              <div>
                <label htmlFor="featured-events" className="mb-2 block text-sm font-medium text-[#002155]">
                  Featured Event IDs
                </label>
                <input
                  id="featured-events"
                  value={form.featuredEvents}
                  onChange={(e) => setForm({ ...form, featuredEvents: e.target.value })}
                  placeholder="e.g. 1, 2, 5"
                  className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
                />
                <p className="mt-1 text-xs text-[#747782]">
                  Comma-separated event IDs to feature on the platform home page.
                </p>
              </div>
            </div>
          </section>

          {/* Taxonomy */}
          <section className="border border-[#c4c6d3] bg-white p-5 md:p-6">
            <h2 className="text-2xl font-headline text-[#002155]">Taxonomy</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="departments" className="mb-2 block text-sm font-medium text-[#002155]">
                  Departments
                </label>
                <input
                  id="departments"
                  value={form.departments}
                  onChange={(e) => setForm({ ...form, departments: e.target.value })}
                  placeholder="e.g. CSE, ECE, ME"
                  className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
                />
              </div>
              <div>
                <label htmlFor="tags" className="mb-2 block text-sm font-medium text-[#002155]">
                  Tags
                </label>
                <input
                  id="tags"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="e.g. AI, Sustainability, Design"
                  className="w-full border border-[#c4c6d3] px-3 py-3 text-sm text-[#434651] outline-none focus:border-[#002155]"
                />
              </div>
            </div>
          </section>

          {/* Feature Flags */}
          <section className="border border-[#c4c6d3] bg-white p-5 md:p-6">
            <h2 className="text-2xl font-headline text-[#002155]">Feature Flags</h2>
            <div className="mt-4 divide-y divide-[#e3e2df]">
              {FLAG_FIELDS.map((field) => (
                <label key={field.key} className="flex cursor-pointer items-start gap-3 py-3">
                  <input
                    type="checkbox"
                    checked={form.flags[field.key]}
                    onChange={(e) => setFlag(field.key, e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#002155]"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[#002155]">{field.label}</span>
                    <span className="block text-xs text-[#747782]">{field.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          {/* Rubric Templates (read-only) */}
          <section className="border border-[#c4c6d3] bg-white p-5 md:p-6">
            <h2 className="text-2xl font-headline text-[#002155]">Rubric Templates</h2>
            <p className="mt-1 text-xs text-[#747782]">
              Scoring templates available for event judging. Managed in code; listed here for reference.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {config?.rubrics.templates.map((template) => (
                <div key={template.key} className="border border-[#e3e2df] bg-[#f5f4f0] p-4">
                  <p className="text-sm font-bold text-[#002155]">
                    {template.label} <span className="font-normal text-[#747782]">({template.key})</span>
                  </p>
                  <ul className="mt-2 space-y-1">
                    {template.categories.map((category) => (
                      <li key={category.key} className="flex justify-between text-xs text-[#434651]">
                        <span>{category.label}</span>
                        <span className="font-semibold text-[#002155]">{category.weight}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <div className="flex items-center gap-4">
            <button
              onClick={handleSave}
              disabled={saving || changedCount === 0}
              className="bg-[#002155] px-4 py-3 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            {changedCount === 0 ? (
              <span className="text-xs text-[#747782]">No unsaved changes</span>
            ) : (
              <span className="text-xs text-[#747782]">{changedCount} unsaved change(s)</span>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
