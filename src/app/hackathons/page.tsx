import Link from "next/link";
import prisma from "@/lib/prisma";
import { EVENT_TYPES } from "@/lib/platform-config";
import EventCard from "@/components/hackathons/EventCard";
import CategoryChips from "@/components/hackathons/CategoryChips";

export const metadata = {
  title: "Innovation & Competitions | TCET Centre of Excellence",
  description:
    "Explore hackathons, coding competitions, design challenges and more at TCET Centre of Excellence.",
};

// Live data on every request (event counts, featured and closing-soon lists).
export const dynamic = "force-dynamic";

const serializeEvent = (event: {
  id: number;
  title: string;
  description: string | null;
  eventType: string;
  status: string;
  featured: boolean;
  registrationOpen: boolean;
  startTime: Date;
  endTime: Date;
  submissionLockAt: Date | null;
  totalSessions: number;
  config: unknown;
  department: { id: number; name: string } | null;
  _count: { problems: number; interests: number };
}) => ({
  id: event.id,
  title: event.title,
  description: event.description,
  eventType: event.eventType,
  status: event.status,
  featured: event.featured,
  registrationOpen: event.registrationOpen,
  startTime: event.startTime.toISOString(),
  endTime: event.endTime.toISOString(),
  submissionLockAt: event.submissionLockAt ? event.submissionLockAt.toISOString() : null,
  totalSessions: event.totalSessions,
  config: event.config,
  department: event.department,
  _count: event._count,
});

export default async function HackathonsLandingPage() {
  const [featuredEvents, upcomingEvents, totalEvents, totalParticipants, totalProblems] =
    await Promise.all([
      prisma.hackathonEvent.findMany({
        where: { featured: true },
        include: {
          department: { select: { id: true, name: true } },
          _count: { select: { problems: true, interests: true } },
        },
        orderBy: { startTime: "asc" },
        take: 3,
      }),
      prisma.hackathonEvent.findMany({
        where: { status: "UPCOMING", startTime: { gte: new Date() } },
        include: {
          department: { select: { id: true, name: true } },
          _count: { select: { problems: true, interests: true } },
        },
        orderBy: { startTime: "asc" },
        take: 6,
      }),
      prisma.hackathonEvent.count(),
      prisma.hackathonInterest.count(),
      prisma.problem.count({ where: { eventId: { not: null } } }),
    ]);

  // One grid: featured first (they render as navy cards), then upcoming.
  const seen = new Set<number>();
  const merged = [...featuredEvents, ...upcomingEvents]
    .filter((event) => (seen.has(event.id) ? false : (seen.add(event.id), true)))
    .slice(0, 6);

  const categories = EVENT_TYPES.map((type) => ({ key: type.key, label: type.label }));
  const stats = [
    { label: "Events hosted", value: totalEvents },
    { label: "Participants", value: totalParticipants, suffix: "+" },
    { label: "Problem statements", value: totalProblems },
    { label: "Event formats", value: EVENT_TYPES.length },
  ];

  return (
    <main className="min-h-screen bg-surface pb-16">
      {/* ── Hero (with inline stats) ───────────────────────── */}
      <section className="relative overflow-hidden bg-primary text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 grid grid-cols-2 md:grid-cols-4"
        >
          {[0, 1, 2, 3].map((column) => (
            <div key={column} className="border-l border-white/[0.06] last:border-r" />
          ))}
        </div>
        <div className="relative mx-auto max-w-6xl px-4 py-12 md:px-8 md:py-16">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-secondary-container">
            TCET Centre of Excellence
          </p>
          <h1 className="mt-3 max-w-2xl font-headline text-4xl font-bold leading-[1.05] tracking-tight md:text-5xl">
            Innovation &amp; Competitions
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/80 md:text-base">
            Hackathons, coding competitions and design challenges — form a team, pick a
            problem and build something that matters.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/hackathons/browse"
              className="inline-flex bg-secondary-container px-5 py-3 text-xs font-bold uppercase tracking-wider text-on-secondary-container transition-opacity hover:opacity-90"
            >
              Browse all events
            </Link>
            <Link
              href="/hackathons/external"
              className="inline-flex border border-white/40 px-5 py-3 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:border-white hover:bg-white/10"
            >
              External opportunities
            </Link>
          </div>
          <p className="mt-4 text-sm text-white/70">
            New to hackathons?{" "}
            <Link
              href="/hackathons/learn"
              className="font-semibold text-white underline decoration-secondary-container/60 underline-offset-4 transition-colors hover:decoration-secondary-container"
            >
              Start in the Learning hub →
            </Link>
          </p>

          {/* Stats — merged into the hero, hairline-divided */}
          <dl className="mt-10 grid grid-cols-2 gap-y-8 border-t border-white/10 pt-8 md:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="md:border-l md:border-white/10 md:pl-8 md:first:border-l-0 md:first:pl-0">
                <dt className="order-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
                  {stat.label}
                </dt>
                <dd className="order-1 font-headline text-3xl font-bold tabular-nums text-white md:text-4xl">
                  {stat.value}
                  {stat.suffix ? <span className="text-secondary-container">{stat.suffix}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Events (featured + upcoming in one grid) ───────── */}
      <section className="mx-auto max-w-6xl px-4 pt-12 md:px-8">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-headline text-2xl font-bold text-primary md:text-3xl">
              Events
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Open and upcoming — register before they close.
            </p>
          </div>
          <Link
            href="/hackathons/browse?status=UPCOMING"
            className="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-secondary hover:underline"
          >
            See all →
          </Link>
        </div>

        {merged.length === 0 ? (
          <p className="border border-dashed border-outline-variant bg-surface-container p-8 text-sm text-on-surface-variant">
            No open events right now — new events are announced regularly.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {merged.map((event, index) => (
              <EventCard key={event.id} event={serializeEvent(event)} index={index} />
            ))}
          </div>
        )}
      </section>

      {/* ── Browse by type ─────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-12 md:px-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 className="font-headline text-2xl font-bold text-primary md:text-3xl">
            Browse by type
          </h2>
          <Link
            href="/hackathons/browse"
            className="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-secondary hover:underline"
          >
            All events →
          </Link>
        </div>
        <CategoryChips categories={categories} active="" hrefPrefix="/hackathons/browse" />
      </section>

      {/* ── CTA cards ──────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Link
            href="/hackathons/learn"
            className="group relative flex flex-col justify-between overflow-hidden bg-primary p-6 text-white transition-colors hover:bg-primary-container md:p-7"
          >
            <span
              aria-hidden="true"
              className="ghost-num pointer-events-none absolute right-3 top-1 text-[92px] text-white/[0.08]"
            >
              01
            </span>
            <div className="relative">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-secondary-container">
                Get ready
              </p>
              <h3 className="mt-2 font-headline text-2xl font-bold text-white">
                Learning hub
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/80">
                Guides, frameworks and resources to prepare for your next competition.
              </p>
            </div>
            <span className="mt-6 inline-flex items-center gap-2 border-t border-white/15 pt-4 text-[11px] font-bold uppercase tracking-wider text-white group-hover:underline">
              Browse resources →
            </span>
          </Link>

          <Link
            href="/hackathons/external"
            className="group relative flex flex-col justify-between border border-outline-variant bg-white p-6 transition-colors hover:border-primary hover:bg-surface-container-low md:p-7"
          >
            <span
              aria-hidden="true"
              className="ghost-num pointer-events-none absolute right-3 top-1 text-[92px] text-primary/[0.07]"
            >
              02
            </span>
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-secondary-container" />
            <div className="relative">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-secondary">
                Beyond campus
              </p>
              <h3 className="mt-2 font-headline text-2xl font-bold text-primary">
                External opportunities
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                SIH, Smart India Hackathon and other national competitions at a glance.
              </p>
            </div>
            <span className="mt-6 inline-flex items-center gap-2 border-t border-hairline pt-4 text-[11px] font-bold uppercase tracking-wider text-primary group-hover:underline">
              Explore opportunities →
            </span>
          </Link>
        </div>
      </section>
    </main>
  );
}
