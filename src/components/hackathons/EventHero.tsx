"use client";

import Link from "next/link";
import {
  EventStatusPill,
  splitDescription,
  eventTypeLabel,
  formatDate,
  type EventCardData,
} from "./EventCard";

/**
 * Full-width navy hero band for the event detail page.
 * Editorial treatment: hairline vertical rules, mono metadata, ghost date
 * numeral on large screens.
 */
export default function EventHero({ event }: { event: EventCardData }) {
  return (
    <section className="relative overflow-hidden bg-primary text-white">
      {/* Hairline vertical rules — engineering grid, purely decorative */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 grid grid-cols-2 md:grid-cols-4"
      >
        {[0, 1, 2, 3].map((column) => (
          <div key={column} className="border-l border-white/[0.06] last:border-r" />
        ))}
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-10 md:px-8 md:py-14">
        <Link
          href="/hackathons/browse"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60 transition-colors hover:text-white"
        >
          <span aria-hidden="true">←</span> Browse all events
        </Link>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center border border-secondary-container px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-secondary-container">
            {eventTypeLabel(event.eventType)}
          </span>
          <EventStatusPill status={event.status} onDark />
          {event.registrationOpen && event.status !== 'CLOSED' ? (
            <span className="inline-flex items-center gap-1.5 bg-secondary-container px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-on-secondary-container">
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-on-secondary-container"
                aria-hidden="true"
              />
              Registrations open
            </span>
          ) : null}
        </div>

        <h1 className="mt-4 max-w-3xl font-headline text-3xl font-bold leading-tight tracking-tight md:text-5xl">
          {event.title}
        </h1>

        {event.description ? (
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/80 md:text-base">
            {splitDescription(event.description).map((part, partIndex) =>
              part.type === "url" ? (
                <a
                  key={partIndex}
                  href={part.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all font-semibold text-secondary-container underline decoration-secondary-container/60 underline-offset-2 transition-colors hover:text-white hover:decoration-white"
                >
                  {part.value}
                </a>
              ) : (
                <span key={partIndex}>{part.value}</span>
              )
            )}
          </p>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-x-12 gap-y-6 md:mt-10">
          <div className="border-l border-white/15 pl-4">
            <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
              Dates
            </span>
            <span className="mt-1 block font-mono text-sm font-semibold text-white tabular-nums">
              {formatDate(event.startTime)} — {formatDate(event.endTime)}
            </span>
          </div>
          {event.department ? (
            <div className="border-l border-white/15 pl-4">
              <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
                Department
              </span>
              <span className="mt-1 block text-sm font-semibold text-white">
                {event.department.name}
              </span>
            </div>
          ) : null}
          {event.submissionLockAt && event.status !== "CLOSED" ? (
            <div className="border-l border-white/15 pl-4">
              <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
                Registration closes
              </span>
              <span className="mt-1 block font-mono text-sm font-semibold text-white tabular-nums">
                {formatDate(event.submissionLockAt)}
              </span>
            </div>
          ) : null}
        </div>

        {/* Ghost date numeral — large screens only */}
        {event.startTime ? (
          <div
            aria-hidden="true"
            className="ghost-num pointer-events-none absolute -right-2 bottom-0 hidden select-none text-[120px] text-white/[0.06] lg:block"
          >
            {new Intl.DateTimeFormat("en-GB", { day: "2-digit" }).format(new Date(event.startTime))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
