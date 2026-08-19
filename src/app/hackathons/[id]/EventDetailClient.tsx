"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import RegistrationForm from "@/components/hackathons/RegistrationForm";
import EventOpsSections from "@/components/hackathons/EventOpsSections";
import TabBar, { type HackathonTab } from "@/components/hackathons/TabBar";
import {
  EventStatusPill,
  eventTypeLabel,
  formatDate,
  teamSizeLabel,
} from "@/components/hackathons/EventCard";
import type {
  ClaimPayload,
  EventDetailPayload,
} from "./page";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LeaderboardRow = {
  rank: number;
  teamName: string;
  problemTitle: string;
  score: number;
  updatedAt: string;
  comments: string[];
  members: { id: number; name: string; email: string; role: string }[];
};

type ApiEnvelope<T> = { success: boolean; message: string; data: T };

type ViewerRole = "STUDENT" | "FACULTY" | "ADMIN" | null;

type ConfigShape = {
  registration?: {
    minTeamSize?: number;
    maxTeamSize?: number;
    allowSolo?: boolean;
    requiresPpt?: boolean;
    requiresProblemSelection?: boolean;
  };
  submission?: { allowUrl?: boolean; allowFile?: boolean };
  leaderboard?: { visibleAfter?: string };
  ticketing?: { enabled?: boolean };
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const descriptionUrlRegex = /((https?:\/\/|www\.)[^\s<>"]+)/gi;

const renderTextWithClickableLinks = (text: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(descriptionUrlRegex)) {
    const matchedUrl = match[0];
    const startIndex = match.index ?? 0;
    if (startIndex > lastIndex) nodes.push(text.slice(lastIndex, startIndex));
    const href = matchedUrl.startsWith("http://") || matchedUrl.startsWith("https://")
      ? matchedUrl
      : `https://${matchedUrl}`;
    nodes.push(
      <a
        key={`desc-link-${startIndex}-${matchedUrl}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all font-semibold text-primary underline"
      >
        {matchedUrl}
      </a>,
    );
    lastIndex = startIndex + matchedUrl.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
};

const sdgTagList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
};

const CLAIM_STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: "In progress",
  SUBMITTED: "Submitted for review",
  SHORTLISTED: "Shortlisted",
  ACCEPTED: "Accepted",
  REVISION_REQUESTED: "Revision requested",
  REJECTED: "Not accepted",
};

const difficultyChipClass = (difficulty: string | null): string => {
  const key = (difficulty ?? "").toLowerCase();
  if (key.includes("easy")) return "border-[#0b6b2e] text-[#0b6b2e]";
  if (key.includes("hard")) return "border-error text-error";
  return "border-secondary text-secondary";
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EventDetailClient({
  event,
  viewerRole,
  initialMyClaim,
  initialMyInterest,
}: {
  event: EventDetailPayload;
  viewerRole: ViewerRole;
  initialMyClaim: ClaimPayload;
  initialMyInterest: boolean;
}) {
  const router = useRouter();
  const { pushToast } = useToast();

  const [activeTab, setActiveTab] = useState<HackathonTab>("about");
  const myClaim = initialMyClaim;
  const [interested, setInterested] = useState(initialMyInterest);
  const [interestLoading, setInterestLoading] = useState(false);

  // Leaderboard — only meaningful once the event is closed.
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[] | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [leaderDept, setLeaderDept] = useState<string>('');
  useEffect(() => {
    if (leaderDept !== '' || !myClaim) return;
    const uid = (myClaim.members?.find((m: {role:string})=>m.role==='LEAD')?.uid ?? '').toString().trim().toUpperCase().replace(/&/g,'');
    const mm = uid.match(/^(\d{2})-([A-Z]+)/);
    let b = mm ? mm[1] : uid;
    const mp: Record<string,string> = { CSECSA:'CSE',CSECSB:'CSE',CSECSC:'CSE',CSECS:'CSE',CSEIOT:'CSE',CSEA:'CSE',CSEB:'CSE',CSEC:'CSE',COMP:'COMP',IT:'IT',CSE:'CSE',AIML:'AIML',AIDS:'AIDS',ECSA:'ECSA',ECS:'ECS',EXTC:'ENTC',ENTC:'ENTC',EXT:'ENTC',MME:'MME',MECH:'MECH',CIVIL:'CIVIL',BVOC:'BVOC',MCA:'MCA',BCA:'BCA',IOT:'IOT' };
    for (const [k,v] of Object.entries(mp)) if (b.startsWith(k)) { b=v; break; }
    if (b) setLeaderDept(b);
  }, [myClaim, leaderDept]);

  const isClosed = event.status === "CLOSED";
  const showRubrics = event.rubricCategories.length > 0;
  const teamSize = teamSizeLabel(event.config);
  const config = (event.config ?? {}) as ConfigShape;

  useEffect(() => {
    if (!isClosed) return;
    let cancelled = false;
    setLeaderboardLoading(true);
    setLeaderboardError(null);
    fetch(`/api/innovation/events/${event.id}/leaderboard${leaderDept ? `?dept=${encodeURIComponent(leaderDept)}` : ''}`, { credentials: "include" })
      .then(async (res) => {
        const payload = (await res.json()) as ApiEnvelope<LeaderboardRow[]>;
        if (!res.ok || !payload.success) {
          throw new Error(payload.message || "Leaderboard not available");
        }
        if (!cancelled) setLeaderboard(payload.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLeaderboardError(err instanceof Error ? err.message : "Could not load leaderboard");
          setLeaderboard([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLeaderboardLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isClosed, event.id, leaderDept]);

  const toggleInterest = async () => {
    if (interestLoading) return;
    if (interested) {
      pushToast("You've already marked interest in this event.", "info");
      return;
    }
    setInterestLoading(true);
    try {
      const res = await fetch("/api/innovation/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id }),
        credentials: "include",
      });
      const payload = (await res.json()) as ApiEnvelope<{ interest: unknown; created: boolean }>;
      if (!res.ok || !payload.success) {
        throw new Error(payload.message || "Could not update interest");
      }
      setInterested(true);
      pushToast("You're marked as interested. Good luck!", "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Something went wrong", "error");
    } finally {
      setInterestLoading(false);
    }
  };

  const handleRegistered = () => {
    pushToast("Team registered successfully!", "success");
    router.refresh();
  };

  // ── Meta grid ───────────────────────────────────────────
  const metaItems: { label: string; value: string }[] = [
    { label: "Dates", value: `${formatDate(event.startTime)} – ${formatDate(event.endTime)}` },
    { label: "Team size", value: teamSize ?? "—" },
    { label: "Problem statements", value: String(event.problems.length || event._count.problems) },
    { label: "Sessions", value: String(event.totalSessions) },
  ];

  // ── Registration info (About tab) ───────────────────────
  const registrationInfoRows: { label: string; value: string }[] = [];
  if (teamSize) registrationInfoRows.push({ label: "Team size", value: teamSize });
  const reg = config.registration;
  if (reg) {
    if (reg.allowSolo) registrationInfoRows.push({ label: "Solo participation", value: "Allowed" });
    if (reg.requiresPpt) registrationInfoRows.push({ label: "Briefing deck", value: "Required with registration" });
    if (reg.requiresProblemSelection) registrationInfoRows.push({ label: "Problem selection", value: "Required at registration" });
  }
  const submission = config.submission;
  if (submission) {
    const methods = [
      submission.allowUrl ? "Submission link" : null,
      submission.allowFile ? "File upload" : null,
    ].filter(Boolean);
    if (methods.length > 0) registrationInfoRows.push({ label: "Submission", value: methods.join(" · ") });
  }
  if (config.leaderboard?.visibleAfter) {
    registrationInfoRows.push({
      label: "Leaderboard",
      value: config.leaderboard.visibleAfter === "LIVE" ? "Live during the event" : "After results are final",
    });
  }
  if (config.ticketing?.enabled) {
    registrationInfoRows.push({ label: "Tickets", value: "Required" });
  }

  const [pptFile, setPptFile] = useState<File | null>(null);
  const [pptUploading, setPptUploading] = useState(false);
  const [pptMessage, setPptMessage] = useState<string | null>(null);

  // Team member editing (leader only, while the window is open)
  const [memberUids, setMemberUids] = useState<string[]>(() => (myClaim?.members ?? []).filter((m) => m.role !== "LEAD").map((m) => m.uid ?? ""));
  const [addQuery, setAddQuery] = useState("");
  const [addSuggestions, setAddSuggestions] = useState<{ id: number; name: string; uid: string; derivedText?: string }[]>([]);
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberMsg, setMemberMsg] = useState<string | null>(null);

  const handlePptReupload = async () => {
    if (!pptFile || !myClaim) return;
    setPptUploading(true);
    setPptMessage(null);
    try {
      const form = new FormData();
      form.append("pptFile", pptFile);
      const res = await fetch(`/api/innovation/claims/${myClaim.claimId}/submission`, {
        method: "PUT",
        credentials: "include",
        body: form,
      });
      const body = (await res.json()) as ApiEnvelope<unknown>;
      if (body.success) {
        setPptMessage("Presentation updated successfully.");
        setPptFile(null);
        window.setTimeout(() => window.location.reload(), 900);
      } else {
        setPptMessage(body.message);
      }
    } catch {
      setPptMessage("Upload failed — please try again.");
    } finally {
      setPptUploading(false);
    }
  };

  // ── Team member editing (leader only, while the window is open) ──
  const fetchMemberSuggestions = (q: string) => {
    if (q.trim().length < 4) {
      setAddSuggestions([]);
      return;
    }
    void fetch(`/api/innovation/students/lookup?q=${encodeURIComponent(q.trim())}`, { credentials: "include" })
      .then((r) => r.json())
      .then((b) => {
        const items = (b?.data?.suggestions ?? []) as { id: number; name: string; uid: string; derivedText?: string }[];
        setAddSuggestions(items.filter((s) => !memberUids.includes(s.uid)));
      })
      .catch(() => setAddSuggestions([]));
  };

  const saveMembers = async () => {
    if (!myClaim) return;
    setMemberSaving(true);
    setMemberMsg(null);
    try {
      const res = await fetch(`/api/innovation/claims/${myClaim.claimId}/members`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberUids }),
      });
      const b = (await res.json().catch(() => null)) as { success?: boolean; message?: string; errors?: string[] } | null;
      setMemberMsg(b?.errors?.[0] ?? b?.message ?? "Failed to update members.");
      if (b?.success) setTimeout(() => window.location.reload(), 800);
    } finally {
      setMemberSaving(false);
    }
  };

  // ── Register CTA panel ───────────────────────────────────
  const canRegister = event.registrationOpen && !isClosed;
  const isFacultyOrAdmin = viewerRole === "FACULTY" || viewerRole === "ADMIN";

  const renderCtaContent = () => {
    if (myClaim) {
      const pptLocked = !!event.submissionLockAt && new Date(event.submissionLockAt) <= new Date();
      return (
        <div className="mt-5 space-y-4">
          <div className="border border-secondary bg-secondary-container/10 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-widest text-secondary">
                Claim status — {CLAIM_STATUS_LABELS[myClaim.status] ?? myClaim.status}
              </p>
              {myClaim.isLeader ? (
                <span className="bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  Team lead
                </span>
              ) : null}
            </div>

            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-on-surface">Team:</dt>
                <dd className="text-on-surface-variant">{myClaim.teamName ?? `Team-${myClaim.claimId}`}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-on-surface">Problem statement:</dt>
                <dd className="text-on-surface-variant">{myClaim.problem?.title ?? "Open Innovation (custom)"}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-on-surface">Mentor:</dt>
                <dd className="text-on-surface-variant">{myClaim.mentor ?? "—"}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-on-surface">Venue:</dt>
                <dd className="text-on-surface-variant">{myClaim.venue ? myClaim.venue.name : "Not assigned yet"}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-on-surface">Presentation:</dt>
                <dd className={myClaim.pptUploaded ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
                  {myClaim.pptUploaded ? (<a href={myClaim.submissionFileUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80">Download PPT</a>) : "Not uploaded"}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-on-surface">Presentation slot:</dt>
                <dd className="font-semibold text-[#002155]">
                  {myClaim.presentationScheduledAt
                    ? new Date(myClaim.presentationScheduledAt).toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" })
                    : "Not scheduled yet"}
                </dd>
              </div>
            </dl>

            <div className="mt-3 border-t border-outline-variant/60 pt-3">
              <p className="text-xs font-bold uppercase tracking-widest text-muted">Team members</p>
              <ul className="mt-2 space-y-1">
                {myClaim.members.map((member) => (
                  <li key={`${member.uid ?? member.email}`} className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-on-surface">{member.name}</span>
                    <span className="text-xs text-muted">{member.uid ?? member.email}</span>
                    {member.role === "LEAD" ? (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                        Lead
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {myClaim.isLeader ? (
            <div className="border border-outline-variant bg-surface-container p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-muted">Update presentation</p>
              {pptLocked ? (
                <p className="mt-2 text-sm font-semibold text-red-600">
                  Presentations are locked — the submission window has closed.
                </p>
              ) : (
                <>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    Re-upload your team's presentation (PPT/PPTX/PDF) — only if needed.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <input
                      type="file"
                      accept=".ppt,.pptx,.pdf"
                      onChange={(e) => setPptFile(e.target.files?.[0] ?? null)}
                      className="text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void handlePptReupload()}
                      disabled={!pptFile || pptUploading}
                      className="bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {pptUploading ? "Uploading…" : "Re-upload PPT"}
                    </button>
                  </div>
                  {pptMessage ? (
                    <p className={`mt-2 text-xs font-semibold ${pptMessage.startsWith("Presentation updated") ? "text-emerald-700" : "text-red-600"}`}>
                      {pptMessage}
                    </p>
                  ) : null}
                  </>
                  )}
                  {!pptLocked ? (
                  <div className="mt-3 border-t border-outline-variant/60 pt-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted">Manage members</p>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    Add or remove team members. Changes apply to everyone — only possible before the submission deadline.
                  </p>
                  <ul className="mt-2 space-y-1">
                    {myClaim.members
                      .filter((m) => m.role !== "LEAD")
                      .map((member) => (
                        <li key={member.uid ?? member.email} className="flex items-center justify-between gap-2 text-sm">
                          <span>
                            <span className="font-semibold text-on-surface">{member.name}</span>{" "}
                            <span className="text-xs text-muted">{member.uid ?? member.email}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setMemberUids((prev) => prev.filter((u) => u !== member.uid))}
                            className="text-xs font-bold text-red-600 underline hover:opacity-70"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                  </ul>
                  <div className="relative mt-2">
                    <input
                      type="text"
                      className="w-full border border-outline-variant px-3 py-2 text-sm"
                      placeholder="Add member by UID (type to search)…"
                      value={addQuery}
                      onChange={(e) => {
                        setAddQuery(e.target.value);
                        fetchMemberSuggestions(e.target.value);
                      }}
                    />
                    {addSuggestions.length > 0 ? (
                      <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto border border-outline-variant bg-white shadow-lg">
                        {addSuggestions.slice(0, 8).map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left text-xs text-on-surface hover:bg-surface-container"
                              onClick={() => {
                                setMemberUids((prev) => (prev.includes(s.uid) ? prev : [...prev, s.uid]));
                                setAddQuery("");
                                setAddSuggestions([]);
                              }}
                            >
                              <span className="font-semibold">{s.name}</span>{" "}
                              <span className="text-muted">{s.uid}</span>
                              {s.derivedText ? <span className="ml-1 text-muted">· {s.derivedText}</span> : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  {memberMsg ? (
                    <p className={`mt-2 text-xs font-semibold ${memberMsg.startsWith("Team members updated") || memberMsg.includes("updated") ? "text-emerald-700" : "text-red-600"}`}>
                      {memberMsg}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void saveMembers()}
                    disabled={memberSaving}
                    className="mt-3 bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {memberSaving ? "Saving…" : "Save Members"}
                  </button>
                  </div>
                  ) : null}
                  <p className="mt-3 text-xs text-on-surface-variant">
                  For any other changes to your team, contact{" "}
                  <span className="font-bold text-on-surface">Raunak Singh — 9372499047</span>.
                  </p>
                  </div>
                  ) : (
            <p className="border border-outline-variant bg-surface-container p-4 text-xs text-on-surface-variant">
              You're a team member on this registration — details are view-only. For any changes, ask your team lead
              (or contact Raunak Singh — 9372499047).
            </p>
          )}

          <Link
            href="/hackathons/portal"
            className="inline-flex bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90"
          >
            View my hackathons
          </Link>
        </div>
      );
    }

    if (canRegister) {
      if (viewerRole === "STUDENT") {
        return (
          <div className="mt-5">
            <RegistrationForm
              eventId={event.id}
              config={event.config as Record<string, unknown>}
              problems={event.problems}
              onRegistered={handleRegistered}
            />
          </div>
        );
      }
      if (viewerRole === null) {
        return (
          <div className="mt-5 border border-outline-variant bg-surface-container p-5">
            <p className="text-sm text-on-surface-variant">
              Registration is open for students. Sign in to register your team.
            </p>
            <Link
              href={`/login?callbackUrl=/hackathons/${event.id}`}
              className="mt-4 inline-flex bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90"
            >
              Sign in to register
            </Link>
          </div>
        );
      }
      return (
        <div className="mt-5 border border-outline-variant bg-surface-container p-5">
          <p className="text-sm text-on-surface-variant">
            Registration is open for student teams. Manage this event from the faculty workspace.
          </p>
        </div>
      );
    }

    return (
      <div className="mt-5 border border-outline-variant bg-surface-container p-5">
        <p className="text-sm text-on-surface-variant">Registrations are closed for this event.</p>
      </div>
    );
  };

  const ctaHeading = myClaim
    ? "You're registered"
    : canRegister && viewerRole === "STUDENT"
      ? "Register your team"
      : canRegister
        ? "Registration open"
        : "Registrations closed";

  return (
    <div className="py-8 md:py-10">
      <EventOpsSections
        eventId={event.id}
        status={event.status}
        ops={(((event.config ?? {}) as { ops?: { notices?: boolean; feedback?: boolean; mediaReport?: boolean } }).ops ?? {})}
      />

      {/* ── Meta grid ─────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-px border border-outline-variant bg-outline-variant md:grid-cols-4">
        {metaItems.map((item) => (
          <div key={item.label} className="bg-white p-4 md:p-5">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{item.label}</p>
            <p className="mt-1 text-sm font-semibold text-on-surface tabular-nums">{item.value}</p>
          </div>
        ))}
      </section>

      {/* ── Register CTA ──────────────────────────────────── */}
      <section className="mt-6 border border-outline-variant bg-white p-5 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-secondary">Registration</p>
            <h2 className="mt-1 font-headline text-2xl font-bold text-primary">{ctaHeading}</h2>
          </div>
          {viewerRole === "STUDENT" ? (
            <button
              type="button"
              onClick={toggleInterest}
              disabled={interestLoading}
              className={
                interested
                  ? "inline-flex items-center gap-1.5 bg-secondary-container px-4 py-2 text-xs font-bold uppercase tracking-wider text-on-secondary-container"
                  : "inline-flex items-center gap-1.5 border border-secondary px-4 py-2 text-xs font-bold uppercase tracking-wider text-secondary transition-colors hover:bg-secondary hover:text-white"
              }
            >
              {interested ? "✓ You're interested" : "I'm interested"}
            </button>
          ) : null}
        </div>
        {renderCtaContent()}
        {isFacultyOrAdmin ? (
          <p className="mt-4 border-t border-outline-variant/70 pt-4 text-xs text-on-surface-variant">
            Faculty &amp; admin:{" "}
            <Link
              href={`/innovation/events/${event.id}`}
              className="font-bold text-primary underline"
            >
              manage this event in the legacy workspace →
            </Link>
          </p>
        ) : null}
      </section>

      {/* ── Tabs + panels ─────────────────────────────────── */}
      <section className="mt-8">
        <TabBar
          active={activeTab}
          onChange={setActiveTab}
          showRubrics={showRubrics}
          counts={{
            problems: event.problems.length,
            rubrics: showRubrics ? event.rubricCategories.length : undefined,
          }}
        />

        <div className="border border-t-0 border-outline-variant bg-white p-5 md:p-8">
          {activeTab === "about" ? (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_260px]">
              <div>
                <h3 className="font-headline text-xl font-bold text-primary">About this event</h3>
                {event.description ? (
                  <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-on-surface-variant">
                    {renderTextWithClickableLinks(event.description)}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-on-surface-variant">
                    Full details for this event are shared with registered teams.
                  </p>
                )}
                {event.department ? (
                  <p className="mt-4 text-xs font-bold uppercase tracking-widest text-muted">
                    Department · <span className="text-on-surface-variant">{event.department.name}</span>
                  </p>
                ) : null}
                {event.totalInterested > 0 ? (
                  <p className="mt-1 text-xs font-bold uppercase tracking-widest text-muted">
                    {event.totalInterested} student{event.totalInterested === 1 ? "" : "s"} interested
                  </p>
                ) : null}
              </div>

              {registrationInfoRows.length > 0 ? (
                <aside>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-muted">
                    Registration details
                  </h4>
                  <dl className="mt-3 divide-y divide-hairline border-y border-hairline">
                    {registrationInfoRows.map((row) => (
                      <div key={row.label} className="py-2.5">
                        <dt className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                          {row.label}
                        </dt>
                        <dd className="mt-0.5 text-sm font-semibold text-on-surface">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </aside>
              ) : null}
            </div>
          ) : null}

          {activeTab === "problems" ? (
            <div>
              <h3 className="font-headline text-xl font-bold text-primary">
                Problem statements
              </h3>
              {event.problems.length === 0 ? (
                <p className="mt-4 border border-dashed border-outline-variant bg-surface-container p-6 text-sm text-on-surface-variant">
                  Problem statements will be published for this event soon.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {event.problems.map((problem, index) => (
                    <article
                      key={problem.id}
                      className="border border-outline-variant p-5 transition-colors hover:border-primary"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-muted">
                          #{String(index + 1).padStart(2, "0")}
                        </span>
                        {problem.difficulty ? (
                          <span
                            className={`inline-flex items-center border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${difficultyChipClass(problem.difficulty)}`}
                          >
                            {problem.difficulty}
                          </span>
                        ) : null}
                        {problem.isIndustryProblem ? (
                          <span className="inline-flex items-center bg-secondary-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-on-secondary-container">
                            Industry{problem.industryName ? ` · ${problem.industryName}` : ""}
                          </span>
                        ) : null}
                      </div>

                      <h4 className="mt-2 font-headline text-lg font-bold leading-snug text-primary">
                        {problem.title}
                      </h4>
                      {problem.description ? (
                        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-on-surface-variant">
                          {renderTextWithClickableLinks(problem.description)}
                        </p>
                      ) : null}

                      {sdgTagList(problem.sdgTags).length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {sdgTagList(problem.sdgTags).map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center rounded-full border border-outline-variant px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {problem.supportDocumentUrl ? (
                        <a
                          href={problem.supportDocumentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-4 inline-flex items-center gap-1.5 border border-primary px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary hover:text-white"
                        >
                          Support document ↗
                        </a>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "rubrics" && showRubrics ? (
            <div>
              <h3 className="font-headline text-xl font-bold text-primary">Judging rubric</h3>
              <p className="mt-1 text-sm text-on-surface-variant">
                Teams are scored against these categories after submission.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b-2 border-primary">
                      <th className="py-2.5 pr-4 text-[10px] font-bold uppercase tracking-widest text-muted">
                        Category
                      </th>
                      <th className="py-2.5 pr-4 text-[10px] font-bold uppercase tracking-widest text-muted">
                        Weight
                      </th>
                      <th className="py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted">
                        Max score
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {event.rubricCategories.map((category) => (
                      <tr key={category.id} className="border-b border-outline-variant/70">
                        <td className="py-3 pr-4 font-semibold text-on-surface">{category.label}</td>
                        <td className="py-3 pr-4 text-on-surface-variant">{category.weight}%</td>
                        <td className="py-3 text-on-surface-variant">{category.weight}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {event.rubricCategories.reduce((sum, category) => sum + category.weight, 0) === 100 ? (
                <p className="mt-3 text-xs font-bold uppercase tracking-widest text-secondary">
                  Weights total 100 — out of 100
                </p>
              ) : null}
            </div>
          ) : null}

          {activeTab === "leaderboard" ? (
            <div>
              <h3 className="font-headline text-xl font-bold text-primary">Leaderboard</h3>
              {!isClosed ? (
                <p className="mt-4 border border-dashed border-outline-variant bg-surface-container p-6 text-sm text-on-surface-variant">
                  Results will be published after the event closes.
                </p>
              ) : leaderboardLoading ? (
                <div className="mt-4 h-40 animate-pulse border border-outline-variant bg-surface-container" />
              ) : leaderboardError ? (
                <p className="mt-4 border border-dashed border-outline-variant bg-surface-container p-6 text-sm text-on-surface-variant">
                  {leaderboardError}
                </p>
              ) : leaderboard && leaderboard.length === 0 ? (
                <p className="mt-4 border border-dashed border-outline-variant bg-surface-container p-6 text-sm text-on-surface-variant">
                  No ranked teams yet.
                </p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant/60 py-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">Dept:</span>
                    <select className="border border-outline-variant bg-white px-2 py-1 text-xs" value={leaderDept} onChange={(e) => setLeaderDept(e.target.value)}>
                      <option value="">All departments</option>
                      {['COMP','IT','CSE','AIML','AIDS','ECSA','ENTC','MECH','CIVIL','BVOC','MCA','BCA','IOT'].map((d) => (<option key={d} value={d}>{d}</option>))}
                    </select>
                    <span className="text-xs text-muted">({leaderboard?.length ?? 0} teams)</span>
                  </div>
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b-2 border-primary">
                        <th className="py-2.5 pr-4 text-[10px] font-bold uppercase tracking-widest text-muted">Rank</th>
                        <th className="py-2.5 pr-4 text-[10px] font-bold uppercase tracking-widest text-muted">Team</th>
                        <th className="py-2.5 pr-4 text-[10px] font-bold uppercase tracking-widest text-muted">Problem</th>
                        <th className="py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard?.map((row) => (
                        <tr key={`${row.rank}-${row.teamName}`} className="border-b border-outline-variant/70">
                          <td className="py-3 pr-4">
                            <span
                              className={
                                row.rank === 1
                                  ? "inline-flex h-7 w-7 items-center justify-center bg-secondary-container font-mono text-xs font-bold text-on-secondary-container"
                                  : "inline-flex h-7 w-7 items-center justify-center border border-outline-variant font-mono text-xs font-bold text-on-surface-variant"
                              }
                            >
                              {row.rank}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <p className="font-semibold text-on-surface">{row.teamName}</p>
                            <p className="text-xs text-muted">
                              {row.members.map((member) => member.name).join(", ")}
                            </p>
                            {row.comments && row.comments.length > 0 ? (
                              <div className="mt-2 space-y-1 border-l-2 border-secondary pl-2">
                                {row.comments.map((comment, i) => (
                                  <p key={i} className="text-xs italic text-on-surface-variant">
                                    “{comment}”
                                  </p>
                                ))}
                              </div>
                            ) : null}
                          </td>
                          <td className="py-3 pr-4 text-on-surface-variant">{(row as unknown as {dept?:string}).dept ?? '—'}</td>
                          <td className="py-3 pr-4 text-on-surface-variant">{row.problemTitle}</td>
                          <td className="py-3 font-bold text-primary">{row.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </section>

      <p className="mt-6 text-xs text-muted">
        <EventStatusPill status={event.status} /> {eventTypeLabel(event.eventType)} · Event #{event.id}
      </p>


    </div>
  );
}
