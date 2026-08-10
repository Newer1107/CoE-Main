"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import EventCard, { type EventCardData } from "@/components/hackathons/EventCard";
import CategoryChips from "@/components/hackathons/CategoryChips";
import FilterBar, { type HackathonFilters } from "@/components/hackathons/FilterBar";

/** Static taxonomy matching EVENT_TYPES labels in src/lib/platform-config.ts. */
const EVENT_CATEGORIES = [
  { key: "hackathon", label: "Hackathon" },
  { key: "coding-competition", label: "Coding Competition" },
  { key: "design-challenge", label: "Design Challenge" },
  { key: "project-exhibition", label: "Project Exhibition" },
  { key: "research-competition", label: "Research Competition" },
  { key: "paper-presentation", label: "Paper Presentation" },
  { key: "business-case", label: "Business Case Competition" },
  { key: "workshop", label: "Workshop" },
  { key: "bootcamp", label: "Bootcamp" },
  { key: "innovation-day", label: "Innovation Day" },
];

type ApiEnvelope<T> = { success: boolean; message: string; data: T };

export default function HackathonsBrowsePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const type = searchParams.get("type") ?? "";
  const filters: HackathonFilters = {
    search: searchParams.get("search") ?? "",
    status: searchParams.get("status") ?? "",
    sort: searchParams.get("sort") ?? "",
  };

  const [events, setEvents] = useState<EventCardData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const updateFilters = (next: HackathonFilters) => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (next.search.trim()) params.set("search", next.search.trim());
    if (next.status) params.set("status", next.status);
    if (next.sort) params.set("sort", next.sort);
    const query = params.toString();
    router.replace(query ? `/hackathons/browse?${query}` : "/hackathons/browse");
  };

  const clearFilters = () => {
    router.replace("/hackathons/browse");
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (type) params.set("eventType", type);
        if (filters.status) params.set("status", filters.status);
        if (filters.search.trim()) params.set("search", filters.search.trim());
        if (filters.sort) params.set("sort", filters.sort);
        const query = params.toString();

        const res = await fetch(`/api/innovation/events${query ? `?${query}` : ""}`, {
          credentials: "include",
        });
        const payload = (await res.json()) as ApiEnvelope<EventCardData[]>;
        if (!res.ok || !payload.success) {
          throw new Error(payload.message || "Failed to load events");
        }
        if (!cancelled) {
          setEvents(payload.data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load events");
          setEvents([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [type, filters.search, filters.status, filters.sort]);

  return (
    <main className="min-h-screen bg-surface pb-16">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        {/* ── Header ─────────────────────────────────────── */}
        <header className="border-l-4 border-primary pl-4 md:pl-6">
          <Link
            href="/hackathons"
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-secondary hover:underline"
          >
            ← Innovation &amp; Competitions
          </Link>
          <h1 className="mt-3 font-headline text-3xl font-bold tracking-tight text-balance text-primary md:text-[40px] md:leading-none">
            Browse events
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-on-surface-variant md:text-base">
            Find a hackathon, competition or workshop — filter by type, status and
            deadline to find the one that fits your team.
          </p>
        </header>

        {/* ── Categories (data-driven: only types with events + active) ── */}
        <div className="mt-7">
          <CategoryChips
            categories={(() => {
              const availableKeys = new Set<string>();
              for (const event of events ?? []) {
                if (event.eventType) availableKeys.add(event.eventType);
              }
              return EVENT_CATEGORIES.filter(
                (category) => availableKeys.has(category.key) || category.key === type
              );
            })()}
            active={type}
            onChange={(key) => {
              const params = new URLSearchParams(searchParams.toString());
              if (key) params.set("type", key);
              else params.delete("type");
              router.replace(`/hackathons/browse?${params.toString()}`);
            }}
          />
        </div>

        {/* ── Filters ─────────────────────────────────────── */}
        <div className="mt-4">
          <FilterBar value={filters} onChange={updateFilters} />
        </div>

        {/* ── Results ─────────────────────────────────────── */}
        <div className="mt-8">
          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
              <span className="sr-only">Loading events…</span>
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-56 animate-pulse border border-outline-variant bg-surface-container"
                />
              ))}
            </div>
          ) : error ? (
            <div className="border border-dashed border-outline-variant bg-surface-container p-8">
              <p className="font-headline text-xl font-bold text-primary">Couldn&apos;t load events</p>
              <p className="mt-1 text-sm text-on-surface-variant">{error}</p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 inline-flex border border-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary hover:text-white"
              >
                Try again
              </button>
            </div>
          ) : events && events.length === 0 ? (
            <div className="border border-dashed border-outline-variant bg-surface-container p-8">
              <p className="font-headline text-xl font-bold text-primary">No events found</p>
              <p className="mt-1 text-sm text-on-surface-variant">
                Nothing matches your filters right now. Try clearing them to see everything.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 inline-flex border border-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary hover:text-white"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <>
              <div className="mb-5 flex items-center gap-3 border-b border-hairline pb-3">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  {events ? `${events.length} event${events.length === 1 ? "" : "s"}` : ""}
                </span>
                <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
                <span className="font-mono text-[11px] text-muted">
                  {filters.status || "all"} · {filters.sort ? (filters.sort === "newest" ? "newest first" : filters.sort) : "soonest"}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {events?.map((event, index) => (
                  <EventCard key={event.id} event={event} index={index} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
