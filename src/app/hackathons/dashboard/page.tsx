"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
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

type Certificate = {
  eventId: number;
  title: string;
  earnedAt: string;
};

type RecentResult = {
  eventId: number;
  title: string;
  finalScore: number | null;
  claimStatus: string;
  updatedAt: string;
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

type Opportunity = {
  id: number;
  status: "SAVED" | "INTERESTED";
  opportunity: {
    id: number;
    title: string;
    category: string | null;
    registrationDeadline: string | null;
    applicationUrl: string | null;
    status: string;
  };
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatDateShort = (value: string | null | undefined) => {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const statusPillClass = (status: string) => {
  const s = status.toUpperCase();
  if (s === "ACTIVE") return "bg-success text-white";
  if (s === "UPCOMING") return "border border-primary text-primary bg-white";
  if (s === "JUDGING") return "bg-secondary text-white";
  if (s === "CLOSED" || s === "ARCHIVED") return "bg-outline text-white";
  if (s === "ACCEPTED") return "bg-success text-white";
  if (s === "REJECTED") return "bg-error text-white";
  if (s === "SUBMITTED") return "bg-primary text-white";
  if (s === "SAVED") return "border border-primary text-primary bg-white";
  if (s === "INTERESTED") return "bg-secondary text-white";
  return "border border-outline-variant text-on-surface-variant bg-white";
};

const pillClass =
  "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider";

async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch("/api/hackathons/dashboard", { credentials: "include" });
  const payload = (await res.json()) as ApiEnvelope<DashboardData>;
  if (!res.ok || !payload.success) {
    throw new Error(payload.message || "Failed to load dashboard");
  }
  return payload.data;
}

async function fetchOpportunities(): Promise<Opportunity[]> {
  const res = await fetch("/api/opportunities/my", { credentials: "include" });
  const payload = (await res.json()) as ApiEnvelope<Opportunity[]>;
  if (!res.ok || !payload.success) {
    throw new Error(payload.message || "Failed to load opportunities");
  }
  return payload.data;
}

export default function HackathonDashboardPage() {
  // Consolidated into /hackathons/portal (single hub).
  if (typeof window !== "undefined") {
    window.location.replace("/hackathons/portal");
  }

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);

  useEffect(() => {
    const run = async () => {
      try {
        const [dashboardData, opportunityData] = await Promise.all([
          fetchDashboard(),
          fetchOpportunities(),
        ]);
        setDashboard(dashboardData);
        setOpportunities(opportunityData);
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "Could not load your dashboard"
        );
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

  const emptyBox =
    "border border-dashed border-outline-variant bg-white p-6 text-on-surface-variant text-sm";

  return (
    <main className="mx-auto max-w-7xl px-4 pb-14 min-h-screen md:px-8">
      <header className="mb-8 border-l-4 border-primary pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-primary leading-none">
          My Innovation Dashboard
        </h1>
        <p className="mt-2 text-on-surface-variant max-w-3xl font-body">
          Track your hackathon registrations, deadlines, certificates, results, and saved opportunities.
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-on-surface-variant">Loading your dashboard...</p>
      ) : null}

      {errorMessage ? (
        <p className="mb-4 border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm">
          {errorMessage}
        </p>
      ) : null}

      {!loading && !errorMessage && dashboard ? (
        <>
          {/* Stat cards */}
          <section className="mb-10 grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Registered Events", value: dashboard.registeredEvents.length },
              { label: "Upcoming Deadlines", value: sortedDeadlines.length },
              { label: "Certificates", value: dashboard.certificates.length },
              { label: "Recent Results", value: dashboard.recentResults.length },
            ].map((stat) => (
              <div
                key={stat.label}
                className="border border-outline-variant bg-surface-container p-5"
              >
                <p className="font-headline text-3xl md:text-4xl font-bold text-primary">
                  {stat.value}
                </p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                  {stat.label}
                </p>
              </div>
            ))}
          </section>

          {/* Registered Events */}
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline text-2xl text-primary">Registered Events</h2>
              <span className="text-xs uppercase tracking-widest text-on-surface-variant font-label">
                {dashboard.registeredEvents.length} events
              </span>
            </div>
            {dashboard.registeredEvents.length === 0 ? (
              <p className={emptyBox}>You have not registered for any hackathon events yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {dashboard.registeredEvents.map((event) => (
                  <article
                    key={`${event.eventId}-${event.claimId}`}
                    className="border border-outline-variant bg-white p-5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`${pillClass} ${statusPillClass(event.status)}`}>
                        {event.status}
                      </span>
                      <span className={`${pillClass} ${statusPillClass(event.claimStatus)}`}>
                        {event.claimStatus}
                      </span>
                    </div>
                    <h3 className="mt-2 text-lg font-bold text-primary">{event.title}</h3>
                    <p className="mt-2 text-xs text-on-surface-variant">
                      Team: {event.teamName || `Team-${event.claimId}`} • Role: {event.myRole}
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      Starts: {formatDateTime(event.startTime)}
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      Ends: {formatDateTime(event.endTime)}
                    </p>
                    <Link
                      href={`/hackathons/${event.eventId}`}
                      className="inline-flex mt-4 border border-primary text-primary px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-primary hover:text-white transition-colors"
                    >
                      View Event
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Upcoming Deadlines */}
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline text-2xl text-primary">Upcoming Deadlines</h2>
              <span className="text-xs uppercase tracking-widest text-on-surface-variant font-label">
                {sortedDeadlines.length} deadlines
              </span>
            </div>
            {sortedDeadlines.length === 0 ? (
              <p className={emptyBox}>No upcoming deadlines right now.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sortedDeadlines.map((event) => (
                  <article
                    key={`deadline-${event.eventId}-${event.claimId}`}
                    className="border border-outline-variant bg-white p-5"
                  >
                    <h3 className="text-lg font-bold text-primary">{event.title}</h3>
                    <p className="mt-2 text-xs text-on-surface-variant">
                      Team: {event.teamName || `Team-${event.claimId}`}
                    </p>
                    <p className="mt-1 text-xs font-bold text-secondary">
                      Ends {formatDateTime(event.endTime)}
                    </p>
                    <Link
                      href={`/hackathons/${event.eventId}`}
                      className="inline-flex mt-3 border border-primary text-primary px-3 py-2 text-xs font-bold uppercase tracking-wider hover:bg-primary hover:text-white transition-colors"
                    >
                      View Event
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Certificates */}
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline text-2xl text-primary">Certificates</h2>
              <span className="text-xs uppercase tracking-widest text-on-surface-variant font-label">
                {dashboard.certificates.length} earned
              </span>
            </div>
            {dashboard.certificates.length === 0 ? (
              <p className={emptyBox}>No certificates earned yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {dashboard.certificates.map((certificate) => (
                  <article
                    key={`cert-${certificate.eventId}-${certificate.earnedAt}`}
                    className="border border-outline-variant bg-white p-5"
                  >
                    <p className="text-xs uppercase tracking-widest text-secondary">CERTIFICATE</p>
                    <h3 className="mt-1 text-lg font-bold text-primary">{certificate.title}</h3>
                    <p className="mt-2 text-xs text-on-surface-variant">
                      Earned: {formatDateShort(certificate.earnedAt)}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Recent Results */}
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline text-2xl text-primary">Recent Results</h2>
              <span className="text-xs uppercase tracking-widest text-on-surface-variant font-label">
                {dashboard.recentResults.length} results
              </span>
            </div>
            {dashboard.recentResults.length === 0 ? (
              <p className={emptyBox}>No results published yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {dashboard.recentResults.map((result) => (
                  <article
                    key={`result-${result.eventId}-${result.updatedAt}`}
                    className="border border-outline-variant bg-white p-5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`${pillClass} bg-primary text-white`}
                      >
                        Score: {result.finalScore ?? "—"}
                      </span>
                      <span className={`${pillClass} ${statusPillClass(result.claimStatus)}`}>
                        {result.claimStatus}
                      </span>
                    </div>
                    <h3 className="mt-2 text-lg font-bold text-primary">{result.title}</h3>
                    <p className="mt-2 text-xs text-on-surface-variant">
                      Updated: {formatDateTime(result.updatedAt)}
                    </p>
                    <Link
                      href={`/hackathons/${result.eventId}`}
                      className="inline-flex mt-3 border border-primary text-primary px-3 py-2 text-xs font-bold uppercase tracking-wider hover:bg-primary hover:text-white transition-colors"
                    >
                      View Event
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Recommended */}
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline text-2xl text-primary">Recommended For You</h2>
              <span className="text-xs uppercase tracking-widest text-on-surface-variant font-label">
                {dashboard.recommended.length} events
              </span>
            </div>
            {dashboard.recommended.length === 0 ? (
              <p className={emptyBox}>No recommendations right now. Check back soon!</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {dashboard.recommended.map((event) => (
                  <article
                    key={`rec-${event.eventId}`}
                    className="border border-outline-variant bg-white p-5"
                  >
                    <p className="text-xs uppercase tracking-widest text-secondary">
                      {event.eventType} • {event.status}
                    </p>
                    <h3 className="mt-1 text-lg font-bold text-primary">{event.title}</h3>
                    <p className="mt-2 text-xs text-on-surface-variant">
                      Starts: {formatDateTime(event.startTime)}
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      Ends: {formatDateTime(event.endTime)}
                    </p>
                    <Link
                      href={`/hackathons/${event.eventId}`}
                      className="inline-flex mt-4 bg-primary text-white px-4 py-2 text-xs font-bold uppercase tracking-wider"
                    >
                      View Event
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Saved Opportunities */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline text-2xl text-primary">Saved Opportunities</h2>
              <span className="text-xs uppercase tracking-widest text-on-surface-variant font-label">
                {opportunities.length} saved
              </span>
            </div>
            {opportunities.length === 0 ? (
              <p className={emptyBox}>No saved opportunities yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {opportunities.map((item) => (
                  <article
                    key={item.id}
                    className="border border-outline-variant bg-white p-5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`${pillClass} ${statusPillClass(item.status)}`}>
                        {item.status}
                      </span>
                      {item.opportunity.status ? (
                        <span className={`${pillClass} ${statusPillClass(item.opportunity.status)}`}>
                          {item.opportunity.status}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-2 text-lg font-bold text-primary">
                      {item.opportunity.title}
                    </h3>
                    {item.opportunity.category ? (
                      <p className="mt-1 text-xs uppercase tracking-widest text-secondary">
                        {item.opportunity.category}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-on-surface-variant">
                      Deadline: {formatDateTime(item.opportunity.registrationDeadline)}
                    </p>
                    {item.opportunity.applicationUrl ? (
                      <a
                        href={item.opportunity.applicationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex mt-3 bg-primary text-white px-4 py-2 text-xs font-bold uppercase tracking-wider"
                      >
                        Apply Now
                      </a>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
