"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import EventCard, { type EventCardData } from "@/components/hackathons/EventCard";

type ApiEnvelope<T> = { success: boolean; message: string; data: T };

type PortalUser = {
  name: string;
  email: string;
  role: string;
  uid?: string;
};

type Claim = {
  id: number;
  teamName: string | null;
  status: string;
  updatedAt: string;
  problem: {
    id: number;
    title: string;
    event: {
      id: number;
      title: string;
      status: string;
      startTime: string;
      endTime: string;
    } | null;
  };
};

type Ticket = {
  ticketId: string;
  type: string;
  status: string;
  title: string;
  subjectName: string;
  scheduledAt: string | null;
  issuedAt: string;
  usedAt: string | null;
  downloadUrl: string;
};

type RegisteredEvent = {
  eventId: number;
  title: string;
  eventType: string;
  status: string;
  startTime: string;
  endTime: string;
  claimId: number;
  claimStatus: string;
  teamName: string | null;
  myRole: string;
};

type Certificate = { eventId: number; title: string; earnedAt: string };

type RecentResult = {
  eventId: number;
  title: string;
  finalScore: number | null;
  claimStatus: string;
  updatedAt: string;
};

type CertificateRow = {
  id: number;
  type: "ACHIEVEMENT" | "PARTICIPATION";
  title: string;
  detail: string | null;
  serial: string;
  issuedAt: string;
  eventDate: string;
  downloadUrl: string | null;
};

type RecommendedEvent = {
  eventId: number;
  title: string;
  eventType: string;
  startTime: string;
  endTime: string;
  status: string;
};

type DashboardData = {
  registeredEvents: RegisteredEvent[];
  upcomingDeadlines: RegisteredEvent[];
  certificates: Certificate[];
  recentResults: RecentResult[];
  recommended: RecommendedEvent[];
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const STATUS_PILL: Record<string, string> = {
  ACCEPTED: "bg-success text-white",
  ACTIVE: "bg-success text-white",
  SUBMITTED: "bg-primary text-white",
  SHORTLISTED: "bg-secondary text-white",
  JUDGING: "bg-secondary text-white",
  REJECTED: "bg-error text-white",
  USED: "bg-outline text-white",
  UPCOMING: "border border-primary text-primary bg-white",
  CLOSED: "bg-outline text-white",
  SAVED: "border border-primary text-primary bg-white",
  INTERESTED: "bg-secondary text-white",
};

const pillClass = (status: string) =>
  `inline-flex items-center px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${
    STATUS_PILL[status.toUpperCase()] ??
    "border border-outline-variant text-on-surface-variant bg-white"
  }`;

function SectionHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: { label: string; href: string };
}) {
  return (
    <div className="mb-4 flex items-center gap-3 border-b border-hairline pb-3">
      <h2 className="font-headline text-xl font-bold text-primary">{title}</h2>
      {count != null ? (
        <span className="font-mono text-[11px] font-semibold text-muted">({count})</span>
      ) : null}
      <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
      {action ? (
        <Link
          href={action.href}
          className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-secondary hover:underline"
        >
          {action.label} →
        </Link>
      ) : null}
    </div>
  );
}

function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <p className="border border-dashed border-outline-variant bg-surface-container p-6 text-sm text-on-surface-variant">
      {children}
    </p>
  );
}

export default function PortalClient({ user }: { user: PortalUser }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [certificates, setCertificates] = useState<CertificateRow[]>([]);

  useEffect(() => {
    const run = async () => {
      try {
        const [dashRes, ticketRes, claimRes, certRes] = await Promise.all([
          fetch("/api/hackathons/dashboard", { credentials: "include" }),
          fetch("/api/tickets/my", { credentials: "include" }),
          fetch("/api/innovation/claims/my", { credentials: "include" }),
          fetch("/api/innovation/certificates/my", { credentials: "include" }),
        ]);
        const [dashPayload, ticketPayload, claimPayload, certPayload] = (await Promise.all([
          dashRes.json(),
          ticketRes.json(),
          claimRes.json(),
          certRes.json(),
        ])) as [
          ApiEnvelope<DashboardData>,
          ApiEnvelope<Ticket[]>,
          ApiEnvelope<Claim[]>,
          ApiEnvelope<CertificateRow[]>,
        ];
        if (!dashRes.ok || !dashPayload.success) {
          throw new Error(dashPayload.message || "Failed to load your portal");
        }
        setDashboard(dashPayload.data);
        setTickets(ticketRes.ok && ticketPayload.success ? ticketPayload.data : []);
        setClaims(claimRes.ok && claimPayload.success ? claimPayload.data : []);
        setCertificates(certRes.ok && certPayload.success ? certPayload.data : []);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Could not load your portal");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const sortedDeadlines = dashboard
    ? [...dashboard.upcomingDeadlines].sort(
        (a, b) => new Date(a.endTime).getTime() - new Date(b.endTime).getTime()
      )
    : [];

  const recommendedCards: EventCardData[] = (dashboard?.recommended ?? []).map(
    (event) => ({
      id: event.eventId,
      title: event.title,
      eventType: event.eventType,
      status: event.status,
      startTime: event.startTime,
      endTime: event.endTime,
    })
  );

  const initials = (user.name || "?")
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <main className="min-h-screen pb-14">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-l-4 border-primary pl-4 md:pl-6">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-secondary">
            My Portal
          </p>
          <h1 className="mt-2 font-headline text-3xl font-bold tracking-tight text-primary md:text-[40px] md:leading-none">
            Everything in one place
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-on-surface-variant md:text-base">
            Your profile, registrations, tickets, certificates and results — no more
            hunting through separate pages.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center border border-primary bg-primary font-mono text-sm font-bold text-white"
          >
            {initials}
          </span>
          <div>
            <p className="text-sm font-bold text-primary">{user.name}</p>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              {user.role}
              {user.uid ? ` · ${user.uid}` : ""}
            </p>
          </div>
          <Link
            href="/profile"
            className="ml-2 inline-flex border border-primary px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-primary hover:text-white"
          >
            Full profile
          </Link>
        </div>
      </header>

      {loading ? (
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-40 animate-pulse border border-outline-variant bg-surface-container"
            />
          ))}
        </div>
      ) : errorMessage ? (
        <p className="mt-8 border border-error/40 bg-error-container p-6 text-sm text-on-error-container">
          {errorMessage}
        </p>
      ) : dashboard ? (
        <>
          {/* ── Stat strip ──────────────────────────────────── */}
          <section className="mt-8 grid grid-cols-2 gap-px border border-outline-variant bg-outline-variant md:grid-cols-4">
            {[
              { label: "Registrations", value: dashboard.registeredEvents.length },
              { label: "Upcoming deadlines", value: sortedDeadlines.length },
              { label: "Certificates", value: certificates.length },
              { label: "Recent results", value: dashboard.recentResults.length },
            ].map((stat) => (
              <div key={stat.label} className="bg-white p-5">
                <p className="font-headline text-3xl font-bold tabular-nums text-primary md:text-4xl">
                  {stat.value}
                </p>
                <p className="mt-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                  {stat.label}
                </p>
              </div>
            ))}
          </section>

          {/* ── Registrations + tickets ─────────────────────── */}
          <section className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_320px]">
            <div>
              <SectionHeader
                title="My registrations"
                count={claims.length}
                action={{ label: "Browse events", href: "/hackathons/browse" }}
              />
              {claims.length === 0 ? (
                <EmptyBox>
                  You haven't registered for any hackathons yet — browse events and
                  form your first team.
                </EmptyBox>
              ) : (
                <ul className="divide-y divide-hairline border-y border-hairline">
                  {claims.map((claim) => (
                    <li key={claim.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-primary">
                          {claim.problem.event?.title ?? "Hackathon"}
                        </p>
                        <p className="truncate text-xs text-on-surface-variant">
                          {claim.problem.title}
                          {claim.teamName ? ` · Team: ${claim.teamName}` : ""}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                          {claim.problem.event
                            ? `${formatDate(claim.problem.event.startTime)} — ${formatDate(claim.problem.event.endTime)}`
                            : "Dates TBA"}
                        </p>
                      </div>
                      <span className={pillClass(claim.status)}>{claim.status.replace(/_/g, " ")}</span>
                      {claim.problem.event ? (
                        <Link
                          href={`/hackathons/${claim.problem.event.id}`}
                          className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary hover:underline"
                        >
                          View →
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              {/* Recent results */}
              <div className="mt-10">
                <SectionHeader title="Recent results" count={dashboard.recentResults.length} />
                {dashboard.recentResults.length === 0 ? (
                  <EmptyBox>Results appear here once events you joined are judged.</EmptyBox>
                ) : (
                  <ul className="divide-y divide-hairline border-y border-hairline">
                    {dashboard.recentResults.map((result) => (
                      <li key={`${result.eventId}-${result.updatedAt}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-primary">{result.title}</p>
                          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                            {formatDate(result.updatedAt)}
                          </p>
                        </div>
                        <span className={pillClass(result.claimStatus)}>
                          {result.claimStatus.replace(/_/g, " ")}
                        </span>
                        {result.finalScore != null ? (
                          <span className="font-mono text-sm font-bold tabular-nums text-primary">
                            {result.finalScore}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Right rail — tickets + certificates */}
            <aside className="space-y-10">
              <div>
                <SectionHeader title="Tickets" count={tickets.length} />
                {tickets.length === 0 ? (
                  <EmptyBox>No tickets yet — selected teams receive QR tickets here.</EmptyBox>
                ) : (
                  <ul className="divide-y divide-hairline border-y border-hairline">
                    {tickets.map((ticket) => (
                      <li key={ticket.ticketId} className="py-3.5">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-bold text-primary">{ticket.title}</p>
                          <span className={pillClass(ticket.status)}>{ticket.status}</span>
                        </div>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                          {ticket.ticketId}
                        </p>
                        <a
                          href={ticket.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex border border-primary px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-primary hover:text-white"
                        >
                          Download QR ticket ↓
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <SectionHeader title="Certificates" count={certificates.length} />
                {certificates.length === 0 ? (
                  <EmptyBox>Certificates land here after events close.</EmptyBox>
                ) : (
                  <ul className="divide-y divide-hairline border-y border-hairline">
                    {certificates.map((certificate) => (
                      <li key={certificate.id} className="py-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] ${
                                certificate.type === "ACHIEVEMENT"
                                  ? "bg-secondary text-white"
                                  : "border border-primary text-primary bg-white"
                              }`}
                            >
                              {certificate.type === "ACHIEVEMENT" ? "Achievement" : "Participation"}
                            </span>
                            <p className="mt-1.5 truncate text-sm font-bold text-primary">
                              {certificate.title}
                            </p>
                            {certificate.detail ? (
                              <p className="mt-0.5 line-clamp-1 text-xs text-on-surface-variant">
                                {certificate.detail}
                              </p>
                            ) : null}
                            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                              {formatDate(certificate.eventDate)} · {certificate.serial}
                            </p>
                          </div>
                          {certificate.downloadUrl ? (
                            <a
                              href={certificate.downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 inline-flex items-center gap-1.5 border border-primary px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary transition-colors hover:bg-primary hover:text-white"
                            >
                              Download ↓
                            </a>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          </section>

          {/* ── Recommended ─────────────────────────────────── */}
          {recommendedCards.length > 0 ? (
            <section className="mt-12">
              <SectionHeader
                title="Recommended for you"
                action={{ label: "View all", href: "/hackathons/browse" }}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recommendedCards.map((event, index) => (
                  <EventCard key={event.id} event={event} index={index} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
