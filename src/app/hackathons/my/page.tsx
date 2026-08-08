"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
};

type Claim = {
  id: number;
  teamName: string | null;
  status: string;
  submissionType: "HACKATHON";
  submissionFileUrl: string | null;
  submissionUrl: string | null;
  updatedAt: string;
  documentSummary?: {
    requiredCount: number;
    uploadedCount: number;
  } | null;
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

const statusPillClass = (status: string) => {
  const s = status.toUpperCase();
  if (s === "ACCEPTED" || s === "ACTIVE" || s === "SUBMITTED") return "bg-primary text-white";
  if (s === "REJECTED") return "bg-error text-white";
  if (s === "JUDGING") return "bg-secondary text-white";
  if (s === "USED") return "bg-outline text-white";
  return "border border-outline-variant text-on-surface-variant bg-white";
};

const pillClass =
  "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider";

async function fetchClaims(): Promise<Claim[]> {
  const res = await fetch("/api/innovation/claims/my", { credentials: "include" });
  const payload = (await res.json()) as ApiEnvelope<Claim[]>;
  if (!res.ok || !payload.success) {
    throw new Error(payload.message || "Failed to load registrations");
  }
  return payload.data;
}

async function fetchTickets(): Promise<Ticket[]> {
  const res = await fetch("/api/tickets/my", { credentials: "include" });
  const payload = (await res.json()) as ApiEnvelope<Ticket[]>;
  if (!res.ok || !payload.success) {
    throw new Error(payload.message || "Failed to load tickets");
  }
  return payload.data;
}

export default function MyHackathonsPage() {
  // Consolidated into /hackathons/portal (single hub).
  if (typeof window !== "undefined") {
    window.location.replace("/hackathons/portal");
  }

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [claims, setClaims] = useState<Claim[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);

  useEffect(() => {
    const run = async () => {
      try {
        const [claimData, ticketData] = await Promise.all([fetchClaims(), fetchTickets()]);
        setClaims(claimData);
        setTickets(ticketData);
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "Could not load your hackathons"
        );
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  const emptyBox =
    "border border-dashed border-outline-variant bg-white p-6 text-on-surface-variant text-sm";

  return (
    <main className="mx-auto max-w-7xl px-4 pb-14 min-h-screen md:px-8">
      <header className="mb-8 border-l-4 border-primary pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-primary leading-none">
          My Hackathons
        </h1>
        <p className="mt-2 text-on-surface-variant max-w-3xl font-body">
          Review your hackathon registrations and event tickets.
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-on-surface-variant">Loading your hackathons...</p>
      ) : null}

      {errorMessage ? (
        <p className="mb-4 border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm">
          {errorMessage}
        </p>
      ) : null}

      {!loading && !errorMessage ? (
        <>
          {/* My Registrations */}
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline text-2xl text-primary">My Registrations</h2>
              <span className="text-xs uppercase tracking-widest text-on-surface-variant font-label">
                {claims.length} registrations
              </span>
            </div>
            {claims.length === 0 ? (
              <p className={emptyBox}>
                No hackathon registrations yet.{" "}
                <Link href="/hackathons" className="underline text-primary">
                  Browse hackathons
                </Link>{" "}
                to register your team.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {claims.map((claim) => {
                  const event = claim.problem.event;
                  const title = event?.title || claim.problem.title;
                  const submitted = Boolean(
                    claim.submissionFileUrl || claim.submissionUrl
                  );

                  return (
                    <article key={claim.id} className="border border-outline-variant bg-white p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`${pillClass} ${statusPillClass(claim.status)}`}>
                          {claim.status}
                        </span>
                        <span
                          className={`${pillClass} ${
                            submitted
                              ? "bg-success text-white"
                              : "border border-outline-variant text-on-surface-variant bg-white"
                          }`}
                        >
                          {submitted ? "Submission Uploaded" : "No Submission Yet"}
                        </span>
                      </div>
                      <h3 className="mt-2 text-lg font-bold text-primary">{title}</h3>
                      <p className="mt-2 text-sm text-on-surface-variant">
                        Team: {claim.teamName || `Team-${claim.id}`}
                      </p>
                      {claim.documentSummary ? (
                        <p className="mt-1 text-xs text-on-surface-variant">
                          Documents uploaded: {claim.documentSummary.uploadedCount}/
                          {claim.documentSummary.requiredCount}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-on-surface-variant">
                        Last update: {formatDateTime(claim.updatedAt)}
                      </p>
                      {event ? (
                        <Link
                          href={`/hackathons/${event.id}`}
                          className="inline-flex mt-4 border border-primary text-primary px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-primary hover:text-white transition-colors"
                        >
                          View Event
                        </Link>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* My Tickets */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline text-2xl text-primary">My Tickets</h2>
              <span className="text-xs uppercase tracking-widest text-on-surface-variant font-label">
                {tickets.length} tickets
              </span>
            </div>
            {tickets.length === 0 ? (
              <p className={emptyBox}>No tickets issued yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tickets.map((ticket) => (
                  <article
                    key={ticket.ticketId}
                    className="border border-outline-variant bg-white p-5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`${pillClass} ${statusPillClass(ticket.status)}`}>
                        {ticket.status}
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider text-[#747782]">
                        {ticket.ticketId}
                      </span>
                    </div>
                    <h3 className="mt-2 text-lg font-bold text-primary">{ticket.title}</h3>
                    {ticket.subjectName ? (
                      <p className="mt-1 text-xs uppercase tracking-widest text-secondary">
                        {ticket.subjectName}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-on-surface-variant">
                      Scheduled: {formatDateTime(ticket.scheduledAt)}
                    </p>
                    <a
                      href={ticket.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex mt-3 border border-primary text-primary px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-primary hover:text-white transition-colors"
                    >
                      Download Ticket
                    </a>
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
