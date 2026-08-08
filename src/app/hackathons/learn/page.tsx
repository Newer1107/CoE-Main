'use client';

import { useEffect, useMemo, useState } from 'react';

type ApiResponse<T> = { success: boolean; message: string; data: T | null };

type LearningResource = {
  id: number;
  title: string;
  category: string;
  type: 'PDF' | 'LINK' | 'YOUTUBE' | 'GITHUB' | 'TEMPLATE' | 'WINNING_PROJECT';
  url: string | null;
  fileKey: string | null;
  difficulty: string | null;
  tags: string[] | null;
  createdAt: string;
};

const TYPE_META: Record<LearningResource['type'], { icon: string; label: string; className: string }> = {
  PDF: { icon: '📄', label: 'PDF', className: 'border-[#991b1b] bg-[#fdf2f2] text-[#991b1b]' },
  LINK: { icon: '🔗', label: 'Link', className: 'border-[#002155] bg-[#f0f2fa] text-[#002155]' },
  YOUTUBE: { icon: '▶️', label: 'Video', className: 'border-[#991b1b] bg-[#fdf2f2] text-[#991b1b]' },
  GITHUB: { icon: '🐙', label: 'GitHub', className: 'border-[#434651] bg-[#efeeea] text-[#434651]' },
  TEMPLATE: { icon: '🧩', label: 'Template', className: 'border-[#8c4f00] bg-[#fdf6ec] text-[#8c4f00]' },
  WINNING_PROJECT: { icon: '🏆', label: 'Winning Project', className: 'border-[#8c4f00] bg-[#fdf6ec] text-[#8c4f00]' },
};

const DIFFICULTY_STYLES: Record<string, string> = {
  BEGINNER: 'border-[#0b6b2e] bg-[#f0faf2] text-[#0b6b2e]',
  INTERMEDIATE: 'border-[#8a5a00] bg-[#fdf6ec] text-[#8a5a00]',
  ADVANCED: 'border-[#991b1b] bg-[#fdf2f2] text-[#991b1b]',
};

const difficultyStyle = (difficulty: string | null): string =>
  difficulty && DIFFICULTY_STYLES[difficulty.toUpperCase()]
    ? DIFFICULTY_STYLES[difficulty.toUpperCase()]
    : 'border-[#747782] bg-[#efeeea] text-[#434651]';

const difficultyLabel = (difficulty: string | null): string => {
  if (!difficulty) return 'All levels';
  const words = difficulty.toLowerCase().split(/[_\s]+/);
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

export default function LearningHubPage() {
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/learning-resources', { credentials: 'include' });
        const json = (await res.json()) as ApiResponse<LearningResource[]>;
        if (!json.success) throw new Error(json.message || 'Failed to load learning resources.');
        if (!cancelled) setResources(json.data ?? []);
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : 'Failed to load learning resources.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, LearningResource[]>();
    for (const resource of resources) {
      const key = resource.category || 'General';
      const list = map.get(key);
      if (list) {
        list.push(resource);
      } else {
        map.set(key, [resource]);
      }
    }
    return Array.from(map.entries());
  }, [resources]);

  return (
    <main className="mx-auto min-h-screen max-w-[1560px] px-4 pb-14 md:px-8">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl font-bold leading-none tracking-tight text-[#002155] md:text-[40px]">
          Learning Hub
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[#434651]">
          Guides, templates, recordings and winning projects to level up before your next hackathon.
        </p>
      </header>

      {errorMessage ? (
        <div className="mb-6 max-w-4xl border border-[#991b1b] bg-[#fdf2f2] p-4 text-sm text-[#991b1b]">{errorMessage}</div>
      ) : null}

      {loading ? (
        <p className="text-sm text-[#747782]">Loading resources…</p>
      ) : resources.length === 0 ? (
        <div className="border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-12 text-center">
          <p className="font-headline text-2xl font-bold text-[#002155]">Resources coming soon</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#747782]">
            Hand-picked learning material — PDFs, videos, templates and winning projects — will land here shortly.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {groups.map(([category, items]) => (
            <section key={category}>
              <h2 className="mb-4 font-headline text-2xl font-bold text-[#002155]">{category}</h2>
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {items.map((resource) => {
                  const meta = TYPE_META[resource.type] ?? TYPE_META.LINK;
                  return (
                    <article key={resource.id} className="flex flex-col border border-[#c4c6d3] bg-white p-5 md:p-6">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${meta.className}`}>
                          <span aria-hidden="true">{meta.icon}</span>
                          {meta.label}
                        </span>
                        {resource.difficulty ? (
                          <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${difficultyStyle(resource.difficulty)}`}>
                            {difficultyLabel(resource.difficulty)}
                          </span>
                        ) : null}
                      </div>

                      <h3 className="mt-3 font-headline text-lg font-bold leading-snug text-[#002155]">{resource.title}</h3>

                      {resource.tags && resource.tags.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {resource.tags.map((tag) => (
                            <span key={tag} className="rounded-full border border-[#c4c6d3] bg-[#efeeea] px-2.5 py-0.5 text-[11px] text-[#434651]">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <a
                        href={resource.url || '#download'}
                        target={resource.url ? '_blank' : undefined}
                        rel={resource.url ? 'noopener noreferrer' : undefined}
                        className="mt-auto inline-flex w-fit items-center gap-2 bg-[#002155] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:opacity-90"
                      >
                        {resource.url ? 'Open Resource' : 'Download'}
                        <span aria-hidden="true">{resource.url ? '↗' : '↓'}</span>
                      </a>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
