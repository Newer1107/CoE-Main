"use client";

import Link from "next/link";

// ---------------------------------------------------------------------------
// Shared types + helpers for the public hackathon portal (Stitch design system)
// ---------------------------------------------------------------------------

export type EventDepartment = { id: number; name: string } | null;

export type EventCardData = {
  id: number;
  title: string;
  description?: string | null;
  eventType: string;
  status: string; // UPCOMING | ACTIVE | JUDGING | CLOSED
  featured?: boolean;
  registrationOpen?: boolean;
  startTime: string | Date;
  endTime: string | Date;
  submissionLockAt?: string | Date | null;
  config?: unknown;
  department?: EventDepartment;
  totalSessions?: number;
  totalInterested?: number;
  _count?: { problems?: number; interests?: number };
};

/** Mirrors the EVENT_TYPES taxonomy from src/lib/platform-config.ts. */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  hackathon: "Hackathon",
  "coding-competition": "Coding Competition",
  "design-challenge": "Design Challenge",
  "project-exhibition": "Project Exhibition",
  "research-competition": "Research Competition",
  "paper-presentation": "Paper Presentation",
  "business-case": "Business Case Competition",
  workshop: "Workshop",
  bootcamp: "Bootcamp",
  "innovation-day": "Innovation Day",
};

export const eventTypeLabel = (key: string): string => EVENT_TYPE_LABELS[key] ?? key;

// ---------------------------------------------------------------------------
// Description link splitting — shared by the card and the event hero so URLs
// inside descriptions render as links on every surface.
// ---------------------------------------------------------------------------

const DESCRIPTION_URL_REGEX = /((?:https?:\/\/|www\.)[^\s<>"]+)/gi;

export type DescriptionPart =
  | { type: "text"; value: string }
  | { type: "url"; value: string; href: string };

/** Splits a description into text/URL parts. URLs carry a safe href. */
export const splitDescription = (text: string): DescriptionPart[] => {
  const parts: DescriptionPart[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(DESCRIPTION_URL_REGEX)) {
    const url = match[0];
    const startIndex = match.index ?? 0;
    if (startIndex > lastIndex) parts.push({ type: "text", value: text.slice(lastIndex, startIndex) });
    const href =
      url.startsWith("http://") || url.startsWith("https://")
        ? url
        : `https://${url}`;
    parts.push({ type: "url", value: url, href });
    lastIndex = startIndex + url.length;
  }
  if (lastIndex < text.length) parts.push({ type: "text", value: text.slice(lastIndex) });
  return parts;
};

export const descriptionHasUrl = (text: string | null | undefined): boolean =>
  Boolean(text) && splitDescription(text ?? "").some((part) => part.type === "url");

/** Formats an ISO string / Date as "20 Aug 2026". */
export const formatDate = (value: string | Date | null | undefined): string => {
  if (!value) return "TBA";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "TBA";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

type EventConfigShape = {
  registration?: {
    minTeamSize?: number;
    maxTeamSize?: number;
    allowSolo?: boolean;
    requiresPpt?: boolean;
    requiresProblemSelection?: boolean;
  };
};

/**
 * Human team-size label from an event's config.registration block.
 * Returns null when the event carries no config (legacy events).
 */
export const teamSizeLabel = (config: unknown): string | null => {
  if (!config || typeof config !== "object") return null;
  const registration = (config as EventConfigShape).registration;
  if (!registration) return null;
  const min = registration.minTeamSize ?? 1;
  const max = registration.maxTeamSize;
  if (registration.allowSolo) return max ? `Solo or teams up to ${max}` : "Solo or team";
  if (!max) return null;
  if (min >= max) return max === 1 ? "Solo" : `${max} members`;
  return `${min}–${max} members`;
};

// ---------------------------------------------------------------------------
// Status pill
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  UPCOMING: "border-secondary text-secondary",
  ACTIVE: "border-primary text-primary",
  JUDGING: "bg-secondary-container text-on-secondary-container border-secondary-container",
  CLOSED: "border-outline text-outline",
};

const STATUS_STYLES_ON_DARK: Record<string, string> = {
  UPCOMING: "border-secondary-container text-secondary-container",
  ACTIVE: "border-white/80 text-white",
  JUDGING: "bg-secondary-container text-on-secondary-container border-secondary-container",
  CLOSED: "border-white/40 text-white/60",
};

export function EventStatusPill({
  status,
  onDark = false,
}: {
  status: string;
  onDark?: boolean;
}) {
  const style = onDark
    ? STATUS_STYLES_ON_DARK[status] ?? STATUS_STYLES_ON_DARK.CLOSED
    : STATUS_STYLES[status] ?? STATUS_STYLES.CLOSED;
  return (
    <span
      className={`inline-flex items-center border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${style}`}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Event card (grid tile) — status-aware treatments so the grid never reads
// as a row of identical boxes:
//   featured → navy band with gold rule (hero card)
//   ACTIVE   → white with gold hairline + live indicator
//   JUDGING  → white with gold hairline, gold label
//   UPCOMING → white with hairline top rule
//   CLOSED   → muted surface, results affordance
// ---------------------------------------------------------------------------

export default function EventCard({
  event,
  index,
}: {
  event: EventCardData;
  index?: number;
}) {
  const teamSize = teamSizeLabel(event.config);
  const registrationDeadline = event.submissionLockAt ?? event.endTime;
  const problemCount = event._count?.problems ?? 0;
  const isFeatured = Boolean(event.featured);

  const ghostNumber =
    index != null ? (
      <span
        aria-hidden="true"
        className={`ghost-num pointer-events-none absolute right-4 top-3 text-[64px] ${
          isFeatured ? "text-white/10" : "text-primary/[0.07]"
        }`}
      >
        {String(index + 1).padStart(2, "0")}
      </span>
    ) : null;

  const topRule =
    event.status === "ACTIVE" || event.status === "JUDGING" ? (
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-secondary-container" />
    ) : null;

  const liveDot =
    event.status === "ACTIVE" && event.registrationOpen ? (
      <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-secondary">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-secondary-container" aria-hidden="true" />
        Live
      </span>
    ) : null;

  const containerClass = [
    "group relative flex h-full flex-col border transition-colors",
    isFeatured
      ? "border-primary bg-primary text-white hover:border-primary-container"
      : event.status === "CLOSED"
        ? "border-outline-variant bg-surface-container-low hover:border-outline"
        : "border-outline-variant bg-white hover:border-primary hover:bg-surface-container-low",
  ].join(" ");

  const titleClass = isFeatured
    ? "text-white group-hover:underline decoration-secondary-container decoration-2 underline-offset-4"
    : "text-primary group-hover:underline decoration-primary underline-offset-4";

  const metaText = isFeatured ? "text-white/60" : "text-muted";
  const bodyText = isFeatured ? "text-white/80" : "text-on-surface-variant";
  const ruleClass = isFeatured ? "border-white/15" : "border-hairline";

  return (
    <Link
      href={`/hackathons/${event.id}`}
      className={containerClass}
      aria-label={`${event.title} — ${event.status.toLowerCase()}`}
    >
      {topRule}
      {ghostNumber}
      <div className="flex h-full flex-col p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] ${
              isFeatured
                ? "border-white/30 text-white/80"
                : "border-outline-variant text-on-surface-variant"
            }`}
          >
            {eventTypeLabel(event.eventType)}
          </span>
          <EventStatusPill status={event.status} onDark={isFeatured} />
          {isFeatured ? (
            <span className="inline-flex items-center gap-1.5 bg-secondary-container px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-on-secondary-container">
              Featured
            </span>
          ) : null}
          {liveDot}
        </div>

        <h3 className={`mt-3 font-headline text-xl font-bold leading-snug ${titleClass}`}>
          {event.title}
        </h3>

        {event.description ? (
          <p
            className={`mt-2 text-sm leading-relaxed ${bodyText} ${
              descriptionHasUrl(event.description) ? "" : "line-clamp-2"
            }`}
          >
            {splitDescription(event.description).map((part, partIndex) =>
              part.type === "url" ? (
                <span
                  key={partIndex}
                  className={`break-all font-semibold underline decoration-1 underline-offset-2 ${
                    isFeatured
                      ? "text-secondary-container decoration-secondary-container/60"
                      : "text-secondary decoration-secondary/60"
                  }`}
                >
                  {part.value}
                </span>
              ) : (
                <span key={partIndex}>{part.value}</span>
              )
            )}
          </p>
        ) : null}

        <div className="mt-auto">
          <p className={`mt-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] ${metaText}`}>
            {formatDate(event.startTime)} — {formatDate(event.endTime)}
          </p>

          <div
            className={`mt-3 flex items-center justify-between gap-3 border-t pt-3.5 text-xs ${ruleClass}`}
          >
            <span className={`font-mono text-[11px] uppercase tracking-[0.14em] ${metaText}`}>
              {problemCount > 0
                ? `${problemCount} problem${problemCount === 1 ? "" : "s"}`
                : teamSize ?? `${event.totalSessions ?? 1} session${(event.totalSessions ?? 1) > 1 ? "s" : ""}`}
            </span>
            <span className={`inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] ${metaText}`}>
              {event.status === "CLOSED" ? (
                <>Results
                  <span aria-hidden="true" className="text-secondary">→</span>
                </>
              ) : (
                <>
                  Reg closes {formatDate(registrationDeadline)}
                  <span
                    aria-hidden="true"
                    className={`transition-transform group-hover:translate-x-0.5 ${
                      isFeatured ? "text-secondary-container" : "text-secondary"
                    }`}
                  >
                    →
                  </span>
                </>
              )}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
