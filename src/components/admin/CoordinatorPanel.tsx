"use client";

import { useCallback, useEffect, useState } from "react";

type Tab = "overview" | "venues" | "judges" | "notices" | "scores" | "feedback" | "media";

type Api<T> = { success: boolean; message: string; data: T };

const inputCls = "mt-1 w-full border border-[#c4c6d3] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#002155]";
const btnCls = "bg-[#002155] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider hover:opacity-90 disabled:opacity-50";
const btnGhost = "border border-[#002155] text-[#002155] px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-[#002155]/5 disabled:opacity-50";

export default function CoordinatorPanel({ eventId, eventTitle, isAdmin }: { eventId: number; eventTitle: string; isAdmin?: boolean }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [toast, setToast] = useState<string | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "venues", label: "Venues" },
    { key: "judges", label: "Judges" },
    { key: "notices", label: "Notices" },
    { key: "scores", label: "Scores" },
    { key: "feedback", label: "Feedback" },
    { key: "media", label: "Media" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {toast ? (
        <div className="fixed right-4 top-4 z-50 border border-[#0b6b2e] bg-[#f2fbf4] px-4 py-3 text-sm font-semibold text-[#0b6b2e] shadow-lg">
          {toast}
        </div>
      ) : null}
      <p className="text-xs uppercase tracking-widest text-[#8c4f00]">Coordinator Panel</p>
      <h1 className="mt-1 font-headline text-3xl text-[#002155]">{eventTitle}</h1>
      <div className="mt-4 flex flex-wrap gap-2 border-b border-[#c4c6d3] pb-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider ${
              tab === t.key ? "bg-[#002155] text-white" : "border border-[#c4c6d3] text-[#434651] hover:border-[#002155]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "overview" ? <OverviewTab eventId={eventId} notify={notify} isAdmin={isAdmin} /> : null}
        {tab === "venues" ? <VenuesTab eventId={eventId} notify={notify} /> : null}
        {tab === "judges" ? <JudgesTab eventId={eventId} notify={notify} /> : null}
        {tab === "notices" ? <NoticesTab eventId={eventId} notify={notify} /> : null}
        {tab === "scores" ? <ScoresTab eventId={eventId} notify={notify} isAdmin={isAdmin} /> : null}
        {tab === "feedback" ? <FeedbackTab eventId={eventId} /> : null}
        {tab === "media" ? <MediaTab eventId={eventId} notify={notify} /> : null}
      </div>
    </div>
  );
}

/* ── Overview: event status + judging rounds ──────────────────────────── */
const STATUS_FLOW = ["UPCOMING", "ACTIVE", "JUDGING", "CLOSED"] as const;

function OverviewTab({ eventId, notify, isAdmin }: { eventId: number; notify: (m: string) => void; isAdmin?: boolean }) {
  const [status, setStatus] = useState<string | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);
  const [submissionLockAt, setSubmissionLockAt] = useState<string | null>(null);
  const [round, setRound] = useState<{ round: number; maxRound: number } | null>(null);
  const [coordinators, setCoordinators] = useState<{ userId: number; departmentCode: string | null; user: { id: number; name: string; email: string } }[]>([]);
  const [faculty, setFaculty] = useState<{ id: number; name: string; email: string }[]>([]);
  const [coordPick, setCoordPick] = useState("");
  const [coordDept, setCoordDept] = useState("");
  const [deptCodes, setDeptCodes] = useState<string[]>([]);
  const [newLock, setNewLock] = useState("");
  const [windowBusy, setWindowBusy] = useState(false);

  const load = useCallback(() => {
    void fetch(`/api/innovation/events/${eventId}/ops/rounds`, { credentials: "include" })
      .then((r) => r.json())
      .then((b: Api<{ round: number; maxRound: number }>) => {
        if (b.success) setRound(b.data);
      });
    void fetch(`/api/innovation/admin/events/${eventId}/status`, { credentials: "include" })
      .then((r) => r.json())
      .then((b: Api<{ status: string; registrationOpen: boolean; submissionLockAt: string | null }>) => {
        if (b.success) {
          setStatus(b.data.status);
          setRegistrationOpen(b.data.registrationOpen);
          setSubmissionLockAt(b.data.submissionLockAt);
        }
      })
      .catch(() => null);
    void fetch(`/api/innovation/events/${eventId}/ops/coordinator`, { credentials: "include" })
      .then((r) => r.json())
      .then((b: Api<{ coordinators: { userId: number; departmentCode: string | null; user: { id: number; name: string; email: string } }[]; faculty: { id: number; name: string; email: string }[]; departmentCodes: string[] }>) => {
        if (b.success) {
          setCoordinators(b.data.coordinators);
          setFaculty(b.data.faculty);
          if (b.data.departmentCodes) setDeptCodes(b.data.departmentCodes);
        }
      })
      .catch(() => null);
  }, [eventId, isAdmin]);

  useEffect(load, [load]);

  const advanceStatus = async () => {
    if (!status) return;
    const idx = STATUS_FLOW.indexOf(status as (typeof STATUS_FLOW)[number]);
    if (idx < 0 || idx >= STATUS_FLOW.length - 1) return;
    const next = STATUS_FLOW[idx + 1];
    const res = await fetch(`/api/innovation/admin/events/${eventId}/status`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    const b = (await res.json()) as Api<unknown>;
    notify(b.success ? `Event is now ${next}` : b.message);
    if (b.success) load();
  };

  const saveCoordinator = async () => {
    if (!coordPick) return;
    const res = await fetch(`/api/innovation/events/${eventId}/ops/coordinator`, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ coordinatorId: Number(coordPick), departmentCode: coordDept || null }),
    });
    const b = (await res.json()) as Api<unknown>;
    notify(b.success ? b.message : b.message);
    if (b.success) {
      setCoordPick("");
      setCoordDept("");
      load();
    }
  };

  const removeCoordinator = async (userId: number, departmentCode: string | null) => {
    const res = await fetch(`/api/innovation/events/${eventId}/ops/coordinator`, {
      method: "DELETE",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ coordinatorId: userId, departmentCode }),
    });
    const b = (await res.json()) as Api<unknown>;
    notify(b.success ? b.message : b.message);
    if (b.success) load();
  };

  const updateWindow = async (payload: { registrationOpen?: boolean; submissionLockAt?: string | null }) => {
    setWindowBusy(true);
    try {
      const res = await fetch(`/api/innovation/events/${eventId}/ops/window`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const b = (await res.json()) as Api<{ registrationOpen: boolean; submissionLockAt: string | null }>;
      notify(b.message);
      if (b.success) {
        setRegistrationOpen(b.data.registrationOpen);
        setSubmissionLockAt(b.data.submissionLockAt);
        setNewLock("");
      }
    } finally {
      setWindowBusy(false);
    }
  };

  const advance = async () => {
    const res = await fetch(`/api/innovation/events/${eventId}/ops/rounds`, {
      method: "POST",
      credentials: "include",
    });
    const body = (await res.json()) as Api<{ round: number; maxRound: number }>;
    if (body.success) {
      notify(body.message);
      setRound(body.data);
    } else {
      notify(body.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border border-[#c4c6d3] bg-white p-5">
        <h3 className="font-headline text-xl text-[#002155]">Event Status</h3>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <p className="text-sm">
            Current:{" "}
            <span className="font-bold text-[#002155]">{status ?? "…"}</span>
          </p>
          {status && status !== "CLOSED" ? (
            <button type="button" onClick={() => void advanceStatus()} className={btnCls}>
              Move to {STATUS_FLOW[STATUS_FLOW.indexOf(status as (typeof STATUS_FLOW)[number]) + 1]}
            </button>
          ) : null}
          {status === "CLOSED" ? <p className="text-xs font-semibold text-[#0b6b2e]">Event closed — results final.</p> : null}
        </div>
        <p className="mt-2 text-xs text-[#747782]">
          UPCOMING → ACTIVE (registration open) → JUDGING (scoring open) → CLOSED (terminal). Closing requires every
          team to have rubric scores; final scores are computed from the last round automatically.
        </p>
      </div>

      <div className="border border-[#c4c6d3] bg-white p-5">
        <h3 className="font-headline text-xl text-[#002155]">Registration Window</h3>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <p className="text-sm">
            Registration:{" "}
            <span className={`font-bold ${registrationOpen ? "text-[#0b6b2e]" : "text-[#ba1a1a]"}`}>
              {registrationOpen === null ? "…" : registrationOpen ? "OPEN" : "CLOSED"}
            </span>
          </p>
          {status && status !== "CLOSED" && registrationOpen !== null ? (
            <button
              type="button"
              onClick={() => void updateWindow({ registrationOpen: !registrationOpen })}
              disabled={windowBusy}
              className={btnCls}
            >
              {registrationOpen ? "Close Registration" : "Open Registration"}
            </button>
          ) : null}
        </div>
        <div className="mt-3 border-t border-[#e3e2df] pt-3">
          <p className="text-sm">
            Submission (PPT) lock:{" "}
            <span className="font-bold text-[#002155]">
              {submissionLockAt ? new Date(submissionLockAt).toLocaleString("en-IN") : "No lock set"}
            </span>
          </p>
          {status && status !== "CLOSED" ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input
                type="datetime-local"
                value={newLock}
                onChange={(e) => setNewLock(e.target.value)}
                className="border border-[#c4c6d3] px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => newLock && void updateWindow({ submissionLockAt: new Date(newLock).toISOString() })}
                disabled={windowBusy || !newLock}
                className={btnCls}
              >
                Set New Deadline
              </button>
              {submissionLockAt ? (
                <button
                  type="button"
                  onClick={() => void updateWindow({ submissionLockAt: null })}
                  disabled={windowBusy}
                  className="border border-[#ba1a1a] px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#ba1a1a] hover:bg-[#ba1a1a] hover:text-white"
                >
                  Remove Lock
                </button>
              ) : null}
            </div>
          ) : null}
          <p className="mt-2 text-xs text-[#747782]">
            A late student? Open registration and set a new deadline (e.g. after the Sunday lock) — the form accepts
            them again immediately. Note: registration only works while the event is UPCOMING or ACTIVE.
          </p>
        </div>
      </div>

      <div className="border border-[#c4c6d3] bg-white p-5">
        <h3 className="font-headline text-xl text-[#002155]">Event Coordinators</h3>
        {coordinators.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {coordinators.map((c) => (
              <li key={`${c.userId}-${c.departmentCode ?? 'all'}`} className="flex items-center justify-between gap-3 border-b border-[#e3e2df] py-1.5 text-sm">
                <span className="text-[#434651]">
                  <span className="font-bold text-[#002155]">{c.user.name}</span> ({c.user.email})
                </span>
                <span className="flex items-center gap-2">
                  {isAdmin ? (
                    <select
                      className="border border-[#c4c6d3] bg-white px-2 py-1 text-xs"
                      value={c.departmentCode ?? ""}
                      onChange={(e) => {
                        const to = e.target.value || null;
                        void (async () => {
                          const res = await fetch(`/api/innovation/events/${eventId}/ops/coordinator`, {
                            method: "PATCH",
                            credentials: "include",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ coordinatorId: c.userId, fromDepartmentCode: c.departmentCode, toDepartmentCode: to }),
                          });
                          const b = (await res.json()) as Api<unknown>;
                          notify(b.success ? (b.message as string) : b.message);
                          if (b.success) load();
                        })();
                      }}
                    >
                      <option value="">All depts</option>
                      {deptCodes.map((d) => (<option key={d} value={d}>{d}</option>))}
                    </select>
                  ) : (
                    <span className="inline-flex rounded bg-[#002155]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#002155]">{c.departmentCode ?? 'All depts'}</span>
                  )}
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => void removeCoordinator(c.userId, c.departmentCode)}
                      className="text-xs font-bold text-[#ba1a1a] underline hover:opacity-70"
                    >
                      Remove
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-[#747782]">No coordinator assigned — an admin can assign teachers below.</p>
        )}
        {isAdmin ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select className={inputCls + " md:w-64"} value={coordPick} onChange={(e) => setCoordPick(e.target.value)}>
              <option value="">Add a teacher as coordinator…</option>
              {faculty.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.email})
                  </option>
                ))}
            </select>
            <select className={inputCls + " w-40"} value={coordDept} onChange={(e) => setCoordDept(e.target.value)}>
              <option value="">All departments</option>
              {deptCodes.map((d) => (<option key={d} value={d}>{d}</option>))}
            </select>
            <button type="button" onClick={() => void saveCoordinator()} className={btnCls} disabled={!coordPick}>
              Add Coordinator
            </button>
          </div>
        ) : null}
        <p className="mt-2 text-xs text-[#747782]">
          Dept coordinators only see and manage teams whose lead UID matches their department (e.g. COMP). “All departments” = global access.
        </p>
      </div>

      <div className="border border-[#c4c6d3] bg-white p-5">
        <h3 className="font-headline text-xl text-[#002155]">Judging Rounds</h3>
        <p className="mt-1 text-sm text-[#434651]">
          Judges score in rounds (2× revisit). Advancing locks the current round and opens the next; the final round's
          scores decide results.
        </p>
        {round ? (
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <p className="text-sm">
              Current round:{" "}
              <span className="font-bold text-[#002155]">
                {round.round} / {round.maxRound}
              </span>
            </p>
            {status === "JUDGING" && round.round < round.maxRound ? (
              <button type="button" onClick={() => void advance()} className={btnCls}>
                Open Round {round.round + 1}
              </button>
            ) : null}
            {round.round >= round.maxRound && status === "JUDGING" ? (
              <p className="text-xs font-semibold text-[#0b6b2e]">Final round — results will use these scores.</p>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-sm text-[#747782]">Loading round state…</p>
        )}
      </div>
    </div>
  );
}

/* ── Venues ────────────────────────────────────────────────────────────── */
type VenueRow = { id: number; name: string; capacity: number | null; order: number; departmentCode: string | null; _count: { claims: number }; claims: { id: number; teamName: string | null; status: string; presentationScheduledAt: string | null; round2VenueId: number | null; round2Venue: { id: number; name: string } | null; members: { role: string; user: { name: string; uid: string | null } }[] }[] };
type ClaimLite = { id: number; teamName: string | null; status: string; presentationScheduledAt: string | null; round2VenueId: number | null; round2Venue: { id: number; name: string } | null; members: { role: string; user: { name: string; uid: string | null; email: string } }[] };

function VenuesTab({ eventId, notify }: { eventId: number; notify: (m: string) => void }) {
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [unassigned, setUnassigned] = useState<ClaimLite[]>([]);
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [venueDept, setVenueDept] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [venueSlotInputs, setVenueSlotInputs] = useState<Record<string, string>>({});
  const [venueSlotBusy, setVenueSlotBusy] = useState(false);
  const [deptFilter, setDeptFilter] = useState("");

  const deptFromUid = (uid: string): string => {
    const m = uid.match(/^\d{2}-([A-Z&]+)/);
    if (!m) return "Other";
    const b = m[1];
    const map: Record<string, string> = {
      COMP: "Computer Engg", IT: "Information Tech", CSE: "CSE",
      AIML: "AI & ML", "AI&ML": "AI & ML", AIDS: "AI & DS", "A&DS": "AI & DS",
      ECSA: "E&CS", ECS: "E&CS", EXT: "E&TC", ENTC: "E&TC",
      MME: "Mechanical", MECH: "Mechanical", BCA: "BCA", IOT: "IoT",
    };
    for (const [k, v] of Object.entries(map)) { if (b.startsWith(k)) return v; }
    return b;
  };

  const filteredUnassigned = deptFilter ? unassigned.filter((c) => {
    const lead = c.members.find((m) => m.role === "LEAD");
    return lead && deptFromUid(lead.user.uid ?? "") === deptFilter;
  }) : unassigned;

  const departments = [...new Set(unassigned.map((c) => {
    const lead = c.members.find((m) => m.role === "LEAD");
    return lead ? deptFromUid(lead.user.uid ?? "") : "Other";
  }))].sort();
  const [targetVenue, setTargetVenue] = useState("");
  const [claimVenuePick, setClaimVenuePick] = useState<Record<number, string>>({});
  const [claimSlotInputs, setClaimSlotInputs] = useState<Record<number, string>>({});
  const [claimBusy, setClaimBusy] = useState<Record<number, boolean>>({});

  const load = useCallback(() => {
    void fetch(`/api/innovation/events/${eventId}/ops/venues`, { credentials: "include" })
      .then((r) => r.json())
      .then((b: Api<{ venues: VenueRow[]; unassignedClaims: ClaimLite[] }>) => {
        if (b.success) {
          setVenues(b.data.venues as VenueRow[]);
          setUnassigned(b.data.unassignedClaims);
        }
      });
  }, [eventId]);
  useEffect(load, [load]);

  const create = async () => {
    if (!name.trim()) return;
    const res = await fetch(`/api/innovation/events/${eventId}/ops/venues`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim(), capacity: capacity ? Number(capacity) : null, departmentCode: venueDept || null }),
    });
    const body = (await res.json()) as Api<unknown>;
    notify(body.message);
    if (body.success) {
      setName("");
      setCapacity("");
      setVenueDept("");
      load();
    }
  };

  const remove = async (venueId: number, venueName: string) => {
    const res = await fetch(`/api/innovation/events/${eventId}/ops/venues/${venueId}`, {
      method: "DELETE",
      credentials: "include",
    });
    const body = (await res.json()) as Api<unknown>;
    notify(body.success ? `${venueName} deleted` : body.message);
    if (body.success) load();
  };

    const setVenueSlot = async (claimId: number) => {
    const raw = venueSlotInputs[claimId] ?? "";
    setVenueSlotBusy(true);
    try {
      const res = raw
        ? await fetch(`/api/innovation/events/${eventId}/ops/presentations`, { method: "PUT", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ claimId, scheduledAt: new Date(raw).toISOString() }) })
        : await fetch(`/api/innovation/events/${eventId}/ops/presentations`, { method: "PUT", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ claimId, scheduledAt: null }) });
      const b = (await res.json()) as Api<unknown>;
      notify(b.success ? b.message : b.message);
      if (b.success) load();
    } finally { setVenueSlotBusy(false); }
  };

  const moveClaimVenue = async (claimId: number) => {
    const raw = claimVenuePick[claimId];
    if (!raw) return;
    const venueId = raw === "__none" ? null : Number(raw);
    setClaimBusy((m) => ({ ...m, [claimId]: true }));
    try {
      if (venueId === null) {
        const res = await fetch(`/api/innovation/events/${eventId}/ops/venues/assign`, { method: "DELETE", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ claimIds: [claimId] }) });
        const b = (await res.json()) as Api<unknown>;
        notify(b.success ? "Team unassigned" : b.message);
      } else {
        const res = await fetch(`/api/innovation/events/${eventId}/ops/venues/assign`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ claimIds: [claimId], venueId }) });
        const b = (await res.json()) as Api<unknown>;
        notify(b.success ? "Venue updated" : b.message);
      }
      if (true) load();
    } finally { setClaimBusy((m) => ({ ...m, [claimId]: false })); }
  };

  const saveClaimSlot = async (claimId: number) => {
    const raw = claimSlotInputs[claimId] ?? "";
    setClaimBusy((m) => ({ ...m, [claimId]: true }));
    try {
      if (!raw) {
        const res = await fetch(`/api/innovation/events/${eventId}/ops/presentations`, { method: "PUT", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ claimId, scheduledAt: null }) });
        const b = (await res.json()) as Api<unknown>;
        notify(b.success ? "Slot cleared" : b.message);
      } else {
        const res = await fetch(`/api/innovation/events/${eventId}/ops/presentations`, { method: "PUT", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ claimId, scheduledAt: new Date(raw).toISOString() }) });
        const b = (await res.json()) as Api<unknown>;
        notify(b.success ? "Slot updated" : b.message);
      }
      load();
    } finally { setClaimBusy((m) => ({ ...m, [claimId]: false })); }
  };

  const assign = async () => {
    if (selected.size === 0 || !targetVenue) return;
    const res = await fetch(`/api/innovation/events/${eventId}/ops/venues/assign`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ claimIds: [...selected], venueId: Number(targetVenue) }),
    });
    const body = (await res.json()) as Api<unknown>;
    notify(body.message);
    if (body.success) {
      setSelected(new Set());
      load();
    }
  };

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="border border-[#c4c6d3] bg-white p-5">
        <h3 className="font-headline text-xl text-[#002155]">Venues</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_140px_160px_auto]">
          <input className={inputCls} placeholder="Venue name (e.g. Seminar Hall 1)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={inputCls} placeholder="Capacity (optional)" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          <select className={inputCls} value={venueDept} onChange={(e) => setVenueDept(e.target.value)} title="Department">
            <option value="">All depts (shared)</option>
            <option value="COMP">COMP</option><option value="IT">IT</option><option value="CSE">CSE</option><option value="AIML">AIML</option><option value="AIDS">AIDS</option><option value="ECSA">ECSA</option><option value="ENTC">ENTC</option><option value="MME">MME</option><option value="MECH">MECH</option><option value="CIVIL">CIVIL</option><option value="BVOC">BVOC</option><option value="MCA">MCA</option><option value="BCA">BCA</option><option value="IOT">IOT</option>
          </select>
          <button type="button" onClick={() => void create()} className={btnCls}>
            Add Venue
          </button>
        </div>
        <p className="mt-1 text-xs text-[#747782]">Pick a department to make the venue visible only to that dept's coordinators. Leave as “All depts” to share.</p>
        {venues.length === 0 ? (
          <p className="mt-3 text-sm text-[#747782]">No venues yet — add them before assigning teams.</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {venues.map((v) => (
              <div key={v.id} className="border border-[#e3e2df] bg-[#faf9f5] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[#002155]">{v.name}</p>
                      <span className="inline-flex rounded bg-[#002155]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#002155]">{v.departmentCode ?? 'All'}</span>
                    </div>
                    <p className="text-xs text-[#434651]">
                      {v._count.claims} team{v._count.claims === 1 ? "" : "s"}
                      {v.capacity !== null ? ` / capacity ${v.capacity}` : " · no capacity limit"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select className="border border-[#c4c6d3] bg-white px-1.5 py-1 text-xs" value={v.departmentCode ?? ""} onChange={(e) => {
                      const to = e.target.value || null;
                      void fetch(`/api/innovation/events/${eventId}/ops/venues/${v.id}`, { method: "PUT", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ departmentCode: to }) }).then((r) => r.json()).then((b: Api<unknown>) => { notify((b as Api<unknown>).message); if ((b as Api<unknown>).success) load(); });
                    }}>
                      <option value="">All</option>
                      <option value="COMP">COMP</option><option value="IT">IT</option><option value="CSE">CSE</option><option value="AIML">AIML</option><option value="AIDS">AIDS</option><option value="ECSA">ECSA</option><option value="ENTC">ENTC</option><option value="MME">MME</option><option value="MECH">MECH</option><option value="CIVIL">CIVIL</option><option value="BVOC">BVOC</option><option value="MCA">MCA</option><option value="BCA">BCA</option><option value="IOT">IOT</option>
                    </select>
                    <button type="button" onClick={() => void remove(v.id, v.name)} className="text-xs font-bold uppercase tracking-wider text-red-600 hover:underline">
                      Delete
                    </button>
                  </div>
                </div>
                {v.claims.length > 0 ? (
                  <ul className="mt-2 divide-y divide-[#e3e2df] border-t border-[#e3e2df]">
                    {v.claims.map((c) => {
                      const lead = c.members.find((m) => m.role === "LEAD")?.user;
                      const slot = c.presentationScheduledAt;
                      return (
                        <li key={c.id} className="flex flex-col gap-1.5 py-2">
                          <div className="flex flex-wrap items-center gap-x-3 text-xs text-[#434651]">
                            <span className="font-semibold text-[#002155]">{c.teamName ?? `Team #${c.id}`}</span>
                            <span className="text-[#747782]">·</span>
                            <span>{lead ? `${lead.name} · ${lead.uid ?? "—"}` : "—"}</span>
                            <span className="text-[#002155]/60">· {c.status}</span>
                            {c.status === 'SHORTLISTED' ? (
                              <span className="rounded bg-[#0b6b2e]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#0b6b2e]">
                                R2{c.round2Venue ? `: ${c.round2Venue.name}` : ''}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <select className="border border-[#c4c6d3] bg-white px-1.5 py-1 text-[11px]" value={claimVenuePick[c.id] ?? String(v.id)} onChange={(e) => setClaimVenuePick((m) => ({ ...m, [c.id]: e.target.value }))}>
                              {venues.map((vv) => (<option key={vv.id} value={String(vv.id)}>{vv.name}{vv.id === v.id ? " (current)" : ""}</option>))}
                              <option value="__none">— Unassign —</option>
                            </select>
                            <button type="button" onClick={() => void moveClaimVenue(c.id)} disabled={!!claimBusy[c.id]} className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#002155] underline disabled:opacity-40">Move</button>
                            <span className="text-[10px] text-[#747782]">|</span>
                            {slot ? (
                              <>
                                <span className="text-[11px] font-semibold text-[#002155]">{new Date(slot).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                                <input type="datetime-local" className="w-[150px] border border-[#c4c6d3] px-1.5 py-1 text-[11px]" value={claimSlotInputs[c.id] ?? ""} onChange={(e) => setClaimSlotInputs((m) => ({ ...m, [c.id]: e.target.value }))} />
                                <button type="button" onClick={() => void saveClaimSlot(c.id)} disabled={!!claimBusy[c.id] && !claimSlotInputs[c.id]} className="text-[10px] font-bold text-[#002155] underline disabled:opacity-40">{claimSlotInputs[c.id] ? "Change" : "Edit"}</button>
                                <button type="button" onClick={() => { setClaimSlotInputs((m) => ({ ...m, [c.id]: "" })); void saveClaimSlot(c.id); }} disabled={!!claimBusy[c.id]} className="text-[10px] font-bold text-[#ba1a1a] underline disabled:opacity-40">Clear</button>
                              </>
                            ) : (
                              <>
                                <input type="datetime-local" className="w-[150px] border border-[#c4c6d3] px-1.5 py-1 text-[11px]" value={claimSlotInputs[c.id] ?? ""} onChange={(e) => setClaimSlotInputs((m) => ({ ...m, [c.id]: e.target.value }))} />
                                <button type="button" onClick={() => void saveClaimSlot(c.id)} disabled={!!claimBusy[c.id] || !claimSlotInputs[c.id]} className="text-[10px] font-bold text-[#002155] underline disabled:opacity-40">Set time</button>
                              </>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border border-[#c4c6d3] bg-white p-5">
        <h3 className="font-headline text-xl text-[#002155]">Assign Teams</h3>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select className={inputCls + " md:w-64"} value={targetVenue} onChange={(e) => setTargetVenue(e.target.value)}>
            <option value="">Select venue…</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void assign()} className={btnCls} disabled={selected.size === 0 || !targetVenue}>
            Assign {selected.size > 0 ? `${selected.size} team${selected.size === 1 ? "" : "s"}` : "…"}
          </button>
        </div>
        <div className="mb-3 flex items-center gap-3">
                    <select className="border border-[#c4c6d3] px-3 py-2 text-sm" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
                      <option value="">All Departments</option>
                      {departments.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <span className="text-xs text-[#747782]">{filteredUnassigned.length} team{filteredUnassigned.length === 1 ? "" : "s"}</span>
                  </div>
        {filteredUnassigned.length === 0 ? (
          <p className="mt-3 text-sm text-[#0b6b2e]">All teams are assigned. ✓</p>
        ) : (
          <div className="mt-3 max-h-72 overflow-auto border border-[#e3e2df]">
            <table className="w-full text-sm">
              <thead className="bg-[#f4f6fa] text-left text-xs uppercase tracking-wider text-[#434651]">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Lead</th>
                  <th className="px-3 py-2">Presentation Slot</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredUnassigned.map((c) => (
                  <tr key={c.id} className="border-t border-[#e3e2df]">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                    </td>
                    <td className="px-3 py-2 font-semibold text-[#002155]">{c.teamName ?? `Team #${c.id}`}</td>
                    <td className="px-3 py-2 text-xs text-[#434651]">{(() => { const ld = c.members.find((m) => m.role === "LEAD")?.user; return ld ? `${ld.name} (${ld.uid ?? ""})` : "—"; })()}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{c.presentationScheduledAt ? (
                        <span>
                          <span className="text-[#002155] font-semibold">{new Date(c.presentationScheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                          <button type="button" onClick={() => void setVenueSlot(c.id)} disabled={venueSlotBusy} className="ml-2 text-[10px] font-bold text-[#ba1a1a] underline hover:opacity-70">Clear</button>
                        </span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input type="datetime-local" className="w-[160px] border border-[#c4c6d3] px-1.5 py-1 text-xs" value={venueSlotInputs[c.id] ?? ""} onChange={(e) => setVenueSlotInputs((p) => ({ ...p, [c.id]: e.target.value }))} />
                          <button type="button" onClick={() => void setVenueSlot(c.id)} disabled={venueSlotBusy || !venueSlotInputs[c.id]} className="text-[10px] font-bold text-[#002155] underline hover:opacity-70">Set</button>
                        </div>
                      )}</td>
                    <td className="px-3 py-2 text-xs">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Judges ────────────────────────────────────────────────────────────── */
type JudgeRow = { judge: { id: number; name: string; email: string; role: string }; venues: { id: number; name: string }[] };

function JudgesTab({ eventId, notify }: { eventId: number; notify: (m: string) => void }) {
  const [rows, setRows] = useState<JudgeRow[]>([]);
  const [venues, setVenues] = useState<{ id: number; name: string; departmentCode: string | null }[]>([]);
  const [faculty, setFaculty] = useState<{ id: number; name: string; email: string; role: string }[]>([]);
  const [judgeId, setJudgeId] = useState("");
  const [venueId, setVenueId] = useState("");

  const load = useCallback(() => {
    void fetch(`/api/innovation/events/${eventId}/ops/judges`, { credentials: "include" })
      .then((r) => r.json())
      .then((b: Api<{ assignments: JudgeRow[]; venues: { id: number; name: string; departmentCode: string | null }[]; faculty: { id: number; name: string; email: string; role: string }[] }>) => {
        if (b.success) {
          setRows(b.data.assignments);
          setVenues(b.data.venues);
          setFaculty(b.data.faculty);
        }
      });
  }, [eventId]);
  useEffect(load, [load]);

  const add = async () => {
    if (!judgeId) return;
    const res = await fetch(`/api/innovation/events/${eventId}/ops/judges`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ judgeId: Number(judgeId), venueId: venueId ? Number(venueId) : null }),
    });
    const body = (await res.json()) as Api<unknown>;
    notify(body.message);
    if (body.success) {
      setJudgeId("");
      setVenueId("");
      load();
    }
  };

  const move = async (id: number, nextVenue: string) => {
    const res = await fetch(`/api/innovation/events/${eventId}/ops/judges/${id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ venueId: nextVenue ? Number(nextVenue) : null }),
    });
    const body = (await res.json()) as Api<unknown>;
    notify(body.success ? "Judge updated" : body.message);
    if (body.success) load();
  };

  const remove = async (judgeId: number) => {
    const res = await fetch(`/api/innovation/events/${eventId}/ops/judges/by-judge/${judgeId}`, {
      method: "DELETE",
      credentials: "include",
    });
    const body = (await res.json()) as Api<unknown>;
    notify(body.message);
    if (body.success) load();
  };

  return (
    <div className="border border-[#c4c6d3] bg-white p-5">
      <h3 className="font-headline text-xl text-[#002155]">Judges</h3>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
        <select className={inputCls} value={judgeId} onChange={(e) => setJudgeId(e.target.value)}>
          <option value="">Select faculty / admin…</option>
          {faculty.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({f.email})
            </option>
          ))}
        </select>
        <select className={inputCls} value={venueId} onChange={(e) => setVenueId(e.target.value)}>
          <option value="">All claims (no venue scope)</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void add()} className={btnCls}>
          Assign Judge
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-[#747782]">No judges assigned yet.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {rows.map((r) => (
            <div key={r.judge.id} className="flex flex-wrap items-center justify-between gap-3 border border-[#e3e2df] bg-[#faf9f5] px-4 py-3">
              <div>
                <p className="font-semibold text-[#002155]">{r.judge.name}</p>
                <p className="text-xs text-[#434651]">
                  {r.judge.email} · {r.judge.role} · scope: {r.venues.length > 0 ? r.venues.map(v => v.name).join(", ") : "All claims"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="border border-[#c4c6d3] bg-white px-2 py-1 text-xs"
                  value={r.venues[0]?.id ?? ""}
                  onChange={(e) => void move(r.judge.id, e.target.value)}
                >
                  <option value="">All claims</option>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => void remove(r.judge.id)} className="text-xs font-bold uppercase tracking-wider text-red-600 hover:underline">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Notices ───────────────────────────────────────────────────────────── */
type NoticeRow = { id: number; title: string; body: string; pinned: boolean; createdAt: string };

function NoticesTab({ eventId, notify }: { eventId: number; notify: (m: string) => void }) {
  const [rows, setRows] = useState<NoticeRow[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);

  const load = useCallback(() => {
    void fetch(`/api/innovation/events/${eventId}/ops/notices`, { credentials: "include" })
      .then((r) => r.json())
      .then((b: Api<{ notices: NoticeRow[] }>) => {
        if (b.success) setRows(b.data.notices);
      });
  }, [eventId]);
  useEffect(load, [load]);

  const create = async () => {
    if (!title.trim() || !body.trim()) return;
    const res = await fetch(`/api/innovation/events/${eventId}/ops/notices`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: title.trim(), body: body.trim(), pinned }),
    });
    const b = (await res.json()) as Api<unknown>;
    notify(b.message);
    if (b.success) {
      setTitle("");
      setBody("");
      setPinned(false);
      load();
    }
  };

  const togglePin = async (n: NoticeRow) => {
    const res = await fetch(`/api/innovation/events/${eventId}/ops/notices/${n.id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pinned: !n.pinned }),
    });
    const b = (await res.json()) as Api<unknown>;
    if (b.success) load();
  };

  const remove = async (n: NoticeRow) => {
    const res = await fetch(`/api/innovation/events/${eventId}/ops/notices/${n.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const b = (await res.json()) as Api<unknown>;
    notify(b.message);
    if (b.success) load();
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="border border-[#c4c6d3] bg-white p-5">
        <h3 className="font-headline text-xl text-[#002155]">Publish Notice</h3>
        <input className={inputCls} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className={inputCls + " min-h-28"} placeholder="Notice body — shown to all students on the event page" value={body} onChange={(e) => setBody(e.target.value)} />
        <label className="mt-2 flex items-center gap-2 text-sm text-[#434651]">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          Pin to top
        </label>
        <button type="button" onClick={() => void create()} className={btnCls + " mt-3"}>
          Publish
        </button>
      </div>
      <div className="border border-[#c4c6d3] bg-white p-5">
        <h3 className="font-headline text-xl text-[#002155]">Live Notices ({rows.length})</h3>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-[#747782]">Nothing published yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {rows.map((n) => (
              <div key={n.id} className="border border-[#e3e2df] bg-[#faf9f5] p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-[#002155]">
                    {n.pinned ? "📌 " : ""}
                    {n.title}
                  </p>
                  <div className="flex shrink-0 gap-3 text-xs">
                    <button type="button" onClick={() => void togglePin(n)} className="font-bold uppercase tracking-wider text-[#8c4f00] hover:underline">
                      {n.pinned ? "Unpin" : "Pin"}
                    </button>
                    <button type="button" onClick={() => void remove(n)} className="font-bold uppercase tracking-wider text-red-600 hover:underline">
                      Delete
                    </button>
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[#434651]">{n.body}</p>
                <p className="mt-1 text-[11px] text-[#747782]">{new Date(n.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Scores ────────────────────────────────────────────────────────────── */
type ScoreRow = { id: number; score: number; comment: string | null; judgeId: number | null; judge?: { id: number; name: string } | null; rubricCategory: { id: number; key: string; label: string; weight: number; isCritical: boolean; parentCategoryId: number | null } };
type ScoreClaim = {
  id: number;
  status: string;
  teamName: string | null;
  venue: { id: number; name: string } | null;
  problem: { id: number; title: string } | null;
  presentationScheduledAt: string | null;
  submissionFileKey: string | null;
  round2VenueId: number | null;
  round2Venue: { id: number; name: string } | null;
  rubricScores: ScoreRow[];
  members: { role: string; user: { name: string; email: string; uid: string | null } }[];
};

function ScoresTab({ eventId, notify, isAdmin }: { eventId: number; notify: (m: string) => void; isAdmin?: boolean }) {
  const [categories, setCategories] = useState<{ id: number; key: string; label: string; weight: number; isCritical: boolean; parentCategoryId: number | null }[]>([]);
  const [claims, setClaims] = useState<ScoreClaim[]>([]);
  const [problems, setProblems] = useState<{ id: number; title: string }[]>([]);
  const [round, setRound] = useState<number | null>(null);
  const [round1DeclaredByDept, setRound1DeclaredByDept] = useState<Record<string, boolean>>({});
  const [r2ByDept, setR2ByDept] = useState<Record<string, { status?: string; startAt?: string; endAt?: string }>>({});
  const [advanceSel, setAdvanceSel] = useState<Set<number>>(new Set());
  const [r2VenueId, setR2VenueId] = useState("");
  const [r2StartAt, setR2StartAt] = useState("");
  const [r2EndAt, setR2EndAt] = useState("");
  const [roundBusy, setRoundBusy] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [slotInputs, setSlotInputs] = useState<Record<string, string>>({});
  const [slotBusy, setSlotBusy] = useState(false);
  const [problemPick, setProblemPick] = useState<Record<string, string>>({});
  const [problemQuery, setProblemQuery] = useState<Record<string, string>>({});
  const [problemOpen, setProblemOpen] = useState<Record<string, boolean>>({});
  const [allowOI, setAllowOI] = useState(false);
  const [oiOpen, setOiOpen] = useState<Record<string, boolean>>({});
  const [oiTitle, setOiTitle] = useState<Record<string, string>>({});
  const [oiDesc, setOiDesc] = useState<Record<string, string>>({});
  const [problemBusy, setProblemBusy] = useState(false);
  const [pptBusy, setPptBusy] = useState<Record<number, boolean>>({});
  const [venues, setVenues] = useState<{ id: number; name: string }[]>([]);
  const deptCodes = ['COMP','IT','CSE','AIML','AIDS','ECSA','ENTC','MECH','CIVIL','BVOC','MCA','BCA','IOT'];

  const load = useCallback(() => {
    void fetch(`/api/innovation/events/${eventId}/ops/rounds`, { credentials: "include" })
      .then((r) => r.json())
      .then((b: Api<{ round: number; round1DeclaredByDept: Record<string, boolean>; r2ByDept: Record<string, { status?: string; startAt?: string; endAt?: string }> }>) => {
        if (b.success) {
          setRound(b.data.round);
          setRound1DeclaredByDept(b.data.round1DeclaredByDept);
          setR2ByDept(b.data.r2ByDept);
        }
      });
    void fetch(`/api/innovation/events/${eventId}/ops/scores`, { credentials: "include" })
      .then((r) => r.json())
      .then((b: Api<{ categories: { id: number; key: string; label: string; weight: number; isCritical: boolean; parentCategoryId: number | null }[]; claims: ScoreClaim[]; round: number; problems: { id: number; title: string }[]; allowOpenInnovation: boolean }>) => {
        if (b.success) {
          setCategories(b.data.categories);
          setClaims(b.data.claims);
          setRound(b.data.round);
          if (b.data.problems) setProblems(b.data.problems);
          setAllowOI(b.data.allowOpenInnovation);
        }
      });
    void fetch(`/api/innovation/events/${eventId}/ops/venues`, { credentials: "include" })
      .then((r) => r.json())
      .then((b: Api<{ venues: { id: number; name: string }[] }>) => { if (b.success) setVenues(b.data.venues as any); });
  }, [eventId]);
  useEffect(load, [load]);

  const totalFor = (claim: ScoreClaim) => {
    if (claim.rubricScores.length === 0) return 0;
    const isBinary = categories.some((c) => c.parentCategoryId !== null);
    if (!isBinary) return claim.rubricScores.reduce((sum, s) => sum + s.score, 0);
    // Binary: weighted average across judges per parent (matches finalScore on CLOSED)
    const parents = categories.filter((c) => c.parentCategoryId === null);
    const childToParent = new Map<number, number>();
    for (const c of categories as { id: number; parentCategoryId: number | null }[]) if (c.parentCategoryId !== null) childToParent.set(c.id, c.parentCategoryId);
    const byJudge = new Map<number, typeof claim.rubricScores>();
    for (const s of claim.rubricScores as unknown as { judgeId?: number | null; rubricCategory: { id: number } } & ScoreRow[]) {
      const jid = ((s as { judgeId?: number | null }).judgeId ?? 0);
      if (!byJudge.has(jid)) byJudge.set(jid, []);
      byJudge.get(jid)!.push(s);
    }
    const judgeIds = Array.from(byJudge.keys());
    if (judgeIds.length === 0) return 0;
    let finalScore = 0;
    for (const parent of parents) {
      let sumYesRate = 0, scoredJudges = 0;
      for (const jid of judgeIds) {
        const rows = (byJudge.get(jid) ?? []).filter((s) => childToParent.get(s.rubricCategory.id) === parent.id);
        if (rows.length === 0) continue;
        const yes = rows.filter((r) => r.score > 0).length;
        sumYesRate += yes / 5;
        scoredJudges++;
      }
      const avgYesRate = scoredJudges === 0 ? 0 : sumYesRate / scoredJudges;
      finalScore += avgYesRate * parent.weight;
    }
    return Math.round(finalScore);
  };

  const createOIPS = async (claimId: number) => {
    const title = (oiTitle[claimId] ?? "").trim();
    const description = (oiDesc[claimId] ?? "").trim();
    if (title.length < 20 || title.length > 180) { notify("Title must be 20-180 characters"); return; }
    if (description.length < 50 || description.length > 2000) { notify("Description must be 50-2000 characters"); return; }
    setProblemBusy(true);
    try {
      const res = await fetch(`/api/innovation/events/${eventId}/ops/problem`, { method: "PUT", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ claimId, customTitle: title, customDescription: description }) });
      const b = (await res.json()) as Api<unknown>;
      notify(b.success ? b.message : b.message);
      if (b.success) { setOiTitle(p => ({ ...p, [claimId]: "" })); setOiDesc(p => ({ ...p, [claimId]: "" })); setOiOpen(p => ({ ...p, [claimId]: false })); load(); }
    } finally { setProblemBusy(false); }
  };

  const override = async (claimId: number, categoryId: number) => {
    const key = `${claimId}:${categoryId}`;
    const score = Number(overrides[key]);
    const reason = (reasons[key] ?? "").trim();
    if (!Number.isInteger(score) || !reason) {
      notify("Enter a score and a reason");
      return;
    }
    const res = await fetch(`/api/innovation/events/${eventId}/ops/scores`, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ claimId, categoryId, score, reason }),
    });
    const b = (await res.json()) as Api<unknown>;
    notify(b.success ? "Score updated" : b.message);
    if (b.success) load();
  };

  const saveSlot = async (claimId: number) => {
    const raw = slotInputs[claimId] ?? "";
    if (!raw) {
      notify("Pick a date & time first");
      return;
    }
    setSlotBusy(true);
    try {
      const res = await fetch(`/api/innovation/events/${eventId}/ops/presentations`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimId, scheduledAt: new Date(raw).toISOString() }),
      });
      const b = (await res.json()) as Api<unknown>;
      notify(b.success ? b.message : b.message);
      if (b.success) load();
    } finally {
      setSlotBusy(false);
    }
  };

  const clearSlot = async (claimId: number) => {
    setSlotBusy(true);
    try {
      const res = await fetch(`/api/innovation/events/${eventId}/ops/presentations`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimId, scheduledAt: null }),
      });
      const b = (await res.json()) as Api<unknown>;
      notify(b.success ? b.message : b.message);
      if (b.success) load();
    } finally {
      setSlotBusy(false);
    }
  };

  const changeProblem = async (claimId: number) => {
    const problemId = Number(problemPick[claimId]);
    if (!Number.isInteger(problemId)) {
      notify("Pick a problem statement first");
      return;
    }
    setProblemBusy(true);
    try {
      const res = await fetch(`/api/innovation/events/${eventId}/ops/problem`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimId, problemId }),
      });
      const b = (await res.json()) as Api<unknown>;
      notify(b.success ? b.message : b.message);
      if (b.success) load();
    } finally {
      setProblemBusy(false);
    }
  };

  const [declareDept, setDeclareDept] = useState("");

  const declareRound1 = async (dept: string) => {
    if (!dept) { notify("Select a department first"); return; }
    setRoundBusy(true);
    try {
      const res = await fetch(`/api/innovation/events/${eventId}/ops/rounds/declare`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ dept }) });
      const b = (await res.json()) as Api<{ round1Declared: boolean }>;
      notify(b.success ? "Round 1 declared" : b.message);
      if (b.success) load();
    } finally { setRoundBusy(false); }
  };

  const advanceTeams = async () => {
    if (advanceSel.size === 0) { notify("Select teams to advance"); return; }
    setRoundBusy(true);
    try {
      const res = await fetch(`/api/innovation/events/${eventId}/ops/rounds/advance`, {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimIds: Array.from(advanceSel), round2VenueId: r2VenueId || null, dept: declareDept }),
      });
      const b = (await res.json()) as Api<{ advanced: number }>;
      notify(b.success ? `${b.data.advanced} team(s) advanced` : b.message);
      if (b.success) { setAdvanceSel(new Set()); load(); }
    } finally { setRoundBusy(false); }
  };

  const undoDeclare = async (dept: string) => {
    setRoundBusy(true);
    try {
      const res = await fetch(`/api/innovation/events/${eventId}/ops/rounds/declare`, {
        method: "DELETE", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dept }),
      });
      const b = (await res.json()) as Api<{ dept: string }>;
      notify(b.success ? `${dept} declaration undone` : b.message);
      if (b.success) load();
    } finally { setRoundBusy(false); }
  };

  const closeDeptR2 = async (dept: string) => {
    setRoundBusy(true);
    try {
      const res = await fetch(`/api/innovation/events/${eventId}/ops/rounds/close-dept`, {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dept }),
      });
      const b = (await res.json()) as Api<{ dept: string }>;
      notify(b.success ? `${dept} R2 completed` : b.message);
      if (b.success) load();
    } finally { setRoundBusy(false); }
  };

  const openRound2 = async () => {
    setRoundBusy(true);
    try {
      const res = await fetch(`/api/innovation/events/${eventId}/ops/rounds/open-r2`, {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ round2StartAt: r2StartAt || null, round2EndAt: r2EndAt || null, dept: declareDept }),
      });
      const b = (await res.json()) as Api<{ round: number; notified: number }>;
      notify(b.success ? b.message : b.message);
      if (b.success) load();
    } finally { setRoundBusy(false); }
  };

  const toggleAdvance = (claimId: number) => {
    setAdvanceSel((s) => { const next = new Set(s); if (next.has(claimId)) next.delete(claimId); else next.add(claimId); return next; });
  };

  const deselectFromR2 = async (claimId: number) => {
    setRoundBusy(true);
    try {
      const res = await fetch(`/api/innovation/events/${eventId}/ops/rounds/advance`, {
        method: "DELETE", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimIds: [claimId] }),
      });
      const b = (await res.json()) as Api<{ removed: number }>;
      notify(b.success ? "Team removed from R2" : b.message);
      if (b.success) load();
    } finally { setRoundBusy(false); }
  };

  const [r2VenuePick, setR2VenuePick] = useState<Record<number, string>>({});
  const [r2VenueBusy, setR2VenueBusy] = useState<Record<number, boolean>>({});

  const updateR2Venue = async (claimId: number) => {
    const raw = r2VenuePick[claimId];
    if (raw === undefined) return;
    setR2VenueBusy((m) => ({ ...m, [claimId]: true }));
    try {
      const res = await fetch(`/api/innovation/events/${eventId}/ops/rounds/advance`, {
        method: 'PUT', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ claimId, round2VenueId: raw === '__none' ? null : raw || null }),
      });
      const b = (await res.json()) as Api<unknown>;
      notify(b.success ? 'Venue updated' : b.message);
      if (b.success) load();
    } finally { setR2VenueBusy((m) => ({ ...m, [claimId]: false })); }
  };

  const uploadPpt = async (claimId: number, file: File | null) => {
    if (!file || !isAdmin) return;
    setPptBusy((m) => ({ ...m, [claimId]: true }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/innovation/events/${eventId}/ops/claims/${claimId}/ppt`, { method: "PUT", credentials: "include", body: fd });
      const b = (await res.json()) as Api<unknown>;
      notify(b.success ? "PPT updated" : (b.message ?? "Upload failed"));
      if (b.success) load();
    } catch {
      notify("Upload failed");
    } finally {
      setPptBusy((m) => ({ ...m, [claimId]: false }));
    }
  };

  return (
    <div className="border border-[#c4c6d3] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-headline text-xl text-[#002155]">
          Score Review {round ? <span className="text-sm font-normal text-[#747782]">— Round {round}</span> : null}
        </h3>
        <div className="flex items-center gap-2">
          <select className="border border-[#c4c6d3] bg-white px-2 py-1.5 text-xs" id={`export-dept-${eventId}`} defaultValue="">
            <option value="">All depts</option>
            {["COMP","IT","CSE","AIML","AIDS","ECSA","ENTC","MECH","CIVIL","BVOC","MCA","BCA","IOT"].map((d) => (<option key={d} value={d}>{d}</option>))}
          </select>
          <button type="button" className={btnGhost + " px-4 py-1.5 text-xs"} onClick={() => {
            const dept = (document.getElementById(`export-dept-${eventId}`) as HTMLSelectElement | null)?.value ?? "";
            const url = `/api/innovation/events/${eventId}/ops/scores/export${dept ? `?dept=${encodeURIComponent(dept)}` : ""}`;
            window.open(url, "_blank");
          }}>R{round ?? "?"} CSV</button>
          <button type="button" className={btnGhost + " px-4 py-1.5 text-[10px]"} onClick={() => {
            const dept = (document.getElementById(`export-dept-${eventId}`) as HTMLSelectElement | null)?.value ?? "";
            window.open(`/api/innovation/events/${eventId}/ops/scores/export?phase=1${dept ? `&dept=${encodeURIComponent(dept)}` : ""}`, "_blank");
          }}>R1 CSV</button>
          <button type="button" className={btnGhost + " px-4 py-1.5 text-[10px]"} onClick={() => {
            const dept = (document.getElementById(`export-dept-${eventId}`) as HTMLSelectElement | null)?.value ?? "";
            window.open(`/api/innovation/events/${eventId}/ops/scores/export?phase=2${dept ? `&dept=${encodeURIComponent(dept)}` : ""}`, "_blank");
          }}>R2 CSV</button>
        </div>
      </div>
      <p className="mt-1 text-sm text-[#434651]">
        Live totals from judges. Overrides are allowed while the event is in JUDGING and are logged with the reason.
      </p>
      {round != null ? (
        <div className="mt-4 border-t border-[#c4c6d3] pt-4 space-y-3">
          <p className="text-xs font-bold text-[#002155]">Phase 1 Status by Department</p>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#747782]">Active dept:</span>
            <select className="border border-[#c4c6d3] bg-white px-2 py-1.5 text-xs" value={declareDept} onChange={(e) => setDeclareDept(e.target.value)}>
              <option value="">—</option>
              {deptCodes.map((d) => (
                <option key={d} value={d}>{d}{round1DeclaredByDept[d] ? ' ✓' : ''}{r2ByDept[d]?.status === 'open' ? ' (R2)' : ''}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {deptCodes.map((dept) => {
              const declared = round1DeclaredByDept[dept];
              const r2 = r2ByDept[dept];
              return (
                <div key={dept} className="border border-[#e3e2df] bg-[#faf9f5] px-3 py-2 text-xs">
                  <p className="font-bold text-[#002155]">{dept}</p>
                  {declared ? (
                    <div className="mt-1 flex items-center gap-1">
                      <span className="text-[10px] text-[#0b6b2e] font-semibold">✓ Declared</span>
                      {!r2ByDept[dept] ? (
                        <button type="button" onClick={() => void undoDeclare(dept)} disabled={roundBusy} className="text-[9px] font-bold text-[#ba1a1a] underline hover:opacity-70 disabled:opacity-50">Undo</button>
                      ) : null}
                    </div>
                  ) : (
                    <button type="button" onClick={() => void declareRound1(dept)} disabled={roundBusy} className="mt-1 px-2 py-1 text-[10px] font-bold text-[#8c4f00] border border-[#8c4f00] hover:bg-[#8c4f00]/5 disabled:opacity-50">Declare R1</button>
                  )}
                  {r2?.status === 'open' ? (
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-[10px] text-[#0b6b2e] font-semibold">Phase 2 Open</p>
                      <button type="button" onClick={() => void closeDeptR2(dept)} disabled={roundBusy} className="px-2 py-0.5 text-[9px] font-bold border border-[#002155] text-[#002155] hover:bg-[#002155]/5 disabled:opacity-50">Complete R2</button>
                    </div>
                  ) : declared ? (
                    <span className="text-[10px] text-[#747782]">Ready for R2</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {declareDept && round1DeclaredByDept[declareDept] && !r2ByDept[declareDept]?.status ? (
        <div className="mt-4 border-t border-[#c4c6d3] pt-4 space-y-3">
          <p className="text-xs font-bold text-[#002155]">Phase 2 Setup — {declareDept}</p>
          <div className="flex flex-wrap items-center gap-3">
            <select className="border border-[#c4c6d3] bg-white px-2 py-1.5 text-xs" value={r2VenueId} onChange={(e) => setR2VenueId(e.target.value)}>
              <option value="">Phase 2 venue (optional)</option>
              {venues.map((v) => (<option key={v.id} value={v.id}>{v.name}</option>))}
            </select>
            <input type="datetime-local" className="border border-[#c4c6d3] px-2 py-1.5 text-xs" placeholder="Phase 2 start" value={r2StartAt} onChange={(e) => setR2StartAt(e.target.value)} />
            <input type="datetime-local" className="border border-[#c4c6d3] px-2 py-1.5 text-xs" placeholder="Phase 2 end" value={r2EndAt} onChange={(e) => setR2EndAt(e.target.value)} />
          </div>
          <p className="text-[11px] text-[#747782]">Select teams below to advance, then click Open Round 2.</p>
        </div>
      ) : null}
      {declareDept && round1DeclaredByDept[declareDept] ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1 text-[11px] text-[#747782]">
            <input type="checkbox" checked={advanceSel.size === claims.length && claims.length > 0} onChange={() => setAdvanceSel(advanceSel.size === claims.length ? new Set() : new Set(claims.map((c) => c.id)))} className="accent-[#0b6b2e]" />
            Select all {claims.length}
          </label>
          <button type="button" onClick={() => void advanceTeams()} disabled={roundBusy || advanceSel.size === 0} className={btnCls}>{advanceSel.size > 0 ? `Advance ${advanceSel.size} team(s) to R2` : "Select teams first"}</button>
          <button type="button" onClick={() => void openRound2()} disabled={roundBusy} className={btnCls + " bg-[#0b6b2e]"}>Open Round 2 ({declareDept})</button>
        </div>
      ) : null}
      {Object.keys(r2ByDept).length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#c4c6d3] pt-4">
          <p className="text-xs font-bold text-[#002155]">Phase 2 Status:</p>
          {Object.entries(r2ByDept).map(([dept, v]) => (
            <span key={dept} className={`rounded px-2 py-1 text-[10px] font-bold ${v.status === 'open' ? 'bg-[#0b6b2e]/10 text-[#0b6b2e]' : 'bg-[#c4c6d3]/30 text-[#747782]'}`}>
              {dept}: {v.status === 'open' ? 'R2 Open' : v.status ?? 'pending'}{v.startAt ? ` (${new Date(v.startAt).toLocaleDateString('en-IN')})` : ''}
            </span>
          ))}
        </div>
      ) : null}
      {claims.length === 0 ? (
        <p className="mt-4 text-sm text-[#747782]">No claims yet.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {claims.map((claim) => (
            <div key={claim.id} className="border border-[#e3e2df] bg-[#faf9f5] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {declareDept && round1DeclaredByDept[declareDept] ? (
                    <input type="checkbox" checked={advanceSel.has(claim.id)} onChange={() => toggleAdvance(claim.id)} className="accent-[#0b6b2e]" />
                  ) : null}
                  <p className="font-bold text-[#002155]">{claim.teamName ?? `Team #${claim.id}`}</p>
                  {claim.status === 'SHORTLISTED' ? (
                    <>
                      <span className="ml-2 rounded bg-[#0b6b2e]/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[#0b6b2e]">R2 Advanced</span>
                      {declareDept && round1DeclaredByDept[declareDept] ? (
                        <button type="button" onClick={() => void deselectFromR2(claim.id)} disabled={roundBusy} className="ml-1 text-[10px] font-bold text-[#ba1a1a] underline hover:opacity-70 disabled:opacity-40">Remove</button>
                      ) : null}
                      <select
                        className="ml-2 border border-[#c4c6d3] bg-white px-1.5 py-1 text-[10px]"
                        value={r2VenuePick[claim.id] ?? claim.round2VenueId ?? ''}
                        onChange={(e) => { setR2VenuePick((m) => ({ ...m, [claim.id]: e.target.value })); void updateR2Venue(claim.id); }}
                        disabled={!!r2VenueBusy[claim.id]}
                      >
                        <option value="">No R2 venue</option>
                        {venues.map((v) => (
                          <option key={v.id} value={String(v.id)}>{v.name}{v.id === claim.round2VenueId ? ' (current)' : ''}</option>
                        ))}
                      </select>
                    </>
                  ) : null}
                </div>
                <p className="text-xs text-[#434651]">
                  {claim.venue ? claim.venue.name : "No venue"} · Total:{" "}
                  <span className="font-bold text-[#002155]">{totalFor(claim)}</span>/{categories.reduce((s, c) => s + c.weight, 0)}
                </p>
              </div>
              <p className="mt-0.5 text-xs text-[#747782]">
                {claim.members.map((m) => (
                  <span key={m.user.uid ?? m.user.email} className="mr-2">
                    <span className={m.role === "LEAD" ? "font-bold text-[#002155]" : ""}>
                      {m.user.name}
                    </span>
                    <span className="ml-1 text-[10px] text-[#9ca3af]">
                      {m.user.uid ?? ""}
                    </span>
                    {m.role === "LEAD" ? (
                      <span className="ml-1 rounded bg-[#002155]/10 px-1 py-0.5 text-[8px] font-bold uppercase text-[#002155]">Lead</span>
                    ) : null}
                  </span>
                ))}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3 border border-[#e3e2df] bg-white px-3 py-2">
                <div className="min-w-40 flex-1">
                  <p className="text-xs font-semibold text-[#002155]">Problem Statement</p>
                  <p className="text-[11px] text-[#747782]">{claim.problem?.title ?? "—"}</p>
                </div>
                <div className="relative min-w-64 flex-1">
                  <input
                    type="text"
                    className="w-full border border-[#c4c6d3] px-2 py-1 text-xs"
                    placeholder="Search problem statements…"
                    value={problemQuery[claim.id] ?? ""}
                    onFocus={() => setProblemOpen((p) => ({ ...p, [claim.id]: true }))}
                    onChange={(e) => {
                      setProblemQuery((p) => ({ ...p, [claim.id]: e.target.value }));
                      setProblemPick((p) => ({ ...p, [claim.id]: "" }));
                      setProblemOpen((p) => ({ ...p, [claim.id]: true }));
                    }}
                  />
                  {problemOpen[claim.id] && (problemQuery[claim.id] ?? "").trim().length > 0 ? (
                    <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto border border-[#c4c6d3] bg-white shadow-lg">
                      {problems
                        .filter((pr) => pr.title.toLowerCase().includes((problemQuery[claim.id] ?? "").trim().toLowerCase()))
                        .slice(0, 30)
                        .map((pr) => (
                          <li key={pr.id}>
                            <button
                              type="button"
                              className="block w-full px-2 py-1.5 text-left text-xs text-[#434651] hover:bg-[#f5f4f0]"
                              onClick={() => {
                                setProblemPick((p) => ({ ...p, [claim.id]: String(pr.id) }));
                                setProblemQuery((p) => ({ ...p, [claim.id]: pr.title }));
                                setProblemOpen((p) => ({ ...p, [claim.id]: false }));
                              }}
                            >
                              <span className="text-[#9ca3af]">#{pr.id}</span> · {pr.title}
                            </button>
                          </li>
                        ))}
                      {problems.filter((pr) => pr.title.toLowerCase().includes((problemQuery[claim.id] ?? "").trim().toLowerCase())).length === 0 ? (
                        <li className="px-2 py-1.5 text-xs text-[#9ca3af]">No problem statements match</li>
                      ) : null}
                    </ul>
                  ) : null}
                </div>
                <button type="button" onClick={() => void changeProblem(claim.id)} disabled={problemBusy} className={btnGhost + " px-3 py-1 text-[10px]"}>
                  Change
                </button>
                {allowOI ? (
                  <button type="button" onClick={() => setOiOpen(p => ({ ...p, [claim.id]: !p[claim.id] }))} className="text-[10px] font-bold text-[#002155] underline hover:opacity-70">
                    {oiOpen[claim.id] ? "Close" : "Open Innovation"}
                  </button>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 border border-[#e3e2df] bg-white px-3 py-2">
                <div className="min-w-40 flex-1">
                  <p className="text-xs font-semibold text-[#002155]">Team PPT</p>
                  <p className="w-64 truncate text-[11px] text-[#747782]" title={(claim as unknown as { submissionFileKey?: string | null }).submissionFileKey ?? ""}>{(claim as unknown as { submissionFileKey?: string | null }).submissionFileKey ? (claim as unknown as { submissionFileKey: string }).submissionFileKey.split("/").pop() : "No PPT uploaded yet"}</p>
                </div>
                {isAdmin ? (
                  <div className="flex items-center gap-2">
                    <input type="file" accept=".pdf,.ppt,.pptx" className="text-xs" onChange={(e) => { const f = e.target.files?.[0] ?? null; if (f) void uploadPpt(claim.id, f); e.currentTarget.value = ""; }} disabled={!!pptBusy[claim.id]} />
                    {pptBusy[claim.id] ? <span className="text-[10px] text-[#747782]">Uploading…</span> : null}
                  </div>
                ) : null}
              </div>
              {oiOpen[claim.id] ? (
                <div className="mt-3 space-y-2 border border-[#e3e2df] bg-[#faf9f5] px-4 py-3">
                  <p className="text-[11px] font-semibold text-[#002155]">Create Custom Problem Statement for this team</p>
                  <input type="text" className="w-full border border-[#c4c6d3] px-3 py-1.5 text-xs" placeholder="Problem title (20-180 characters)" value={oiTitle[claim.id] ?? ""} onChange={e => setOiTitle(p => ({ ...p, [claim.id]: e.target.value }))} />
                  <textarea className="w-full border border-[#c4c6d3] px-3 py-1.5 text-xs" placeholder="Problem description (50-2000 characters)" rows={4} value={oiDesc[claim.id] ?? ""} onChange={e => setOiDesc(p => ({ ...p, [claim.id]: e.target.value }))} />
                  <p className="text-[10px] text-[#747782]">This creates a new isCustom problem and assigns it to the team immediately.</p>
                  <button type="button" onClick={() => void createOIPS(claim.id)} disabled={problemBusy} className={btnGhost + " px-3 py-1 text-[10px]"}>Create &amp; Assign</button>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-3 border border-[#e3e2df] bg-white px-3 py-2">
                <div className="min-w-40 flex-1">
                  <p className="text-xs font-semibold text-[#002155]">Presentation Slot</p>
                  <p className="text-[11px] text-[#747782]">
                    {claim.presentationScheduledAt
                      ? new Date(claim.presentationScheduledAt).toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" })
                      : "Not scheduled yet"}
                  </p>
                </div>
                <input
                  type="datetime-local"
                  className="border border-[#c4c6d3] px-2 py-1 text-sm"
                  value={slotInputs[claim.id] ?? ""}
                  onChange={(e) => setSlotInputs((p) => ({ ...p, [claim.id]: e.target.value }))}
                />
                <button type="button" onClick={() => void saveSlot(claim.id)} disabled={slotBusy} className={btnGhost + " px-3 py-1 text-[10px]"}>
                  Set Slot
                </button>
                {claim.presentationScheduledAt ? (
                  <button type="button" onClick={() => void clearSlot(claim.id)} disabled={slotBusy} className="text-[10px] font-bold text-[#ba1a1a] underline">
                    Clear
                  </button>
                ) : null}
              </div>
              <div className="mt-3 space-y-3">
                {(() => {
                  const isBinary = categories.some((c) => c.parentCategoryId !== null);
                  if (isBinary) {
                    const parents = categories.filter((c) => c.parentCategoryId === null);
                    let yes = 0;
                    return (
                      <>
                        {parents.map((parent) => {
                          const children = categories.filter((c) => c.parentCategoryId === parent.id);
                          const yesInParam = children.reduce((sum, ch) => { const rows = claim.rubricScores.filter((s) => s.rubricCategory.id === ch.id); if (rows.length === 0) return sum; const avg = rows.reduce((a,b)=>a+b.score,0)/rows.length; return sum + avg; }, 0);
                          const paramScore = ((yesInParam / Math.max(children.length, 1)) * parent.weight).toFixed(1);
                          yes += yesInParam;
                          return (
                            <div key={parent.id} className="border border-[#e3e2df] bg-white px-3 py-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-bold uppercase tracking-wider text-[#002155]">{parent.label}</p>
                                <span className="text-[11px] text-[#747782]">{yesInParam}/{children.length} YES — {paramScore}/{parent.weight}</span>
                              </div>
                              <div className="mt-2 space-y-1.5">
                                {children.map((child) => {
                                  const row = claim.rubricScores.find((s) => s.rubricCategory.id === child.id);
                                  const key = `${claim.id}:${child.id}`;
                                  const val = row?.score;
                                  return (
                                    <div key={child.id} className="flex flex-wrap items-center gap-2 border border-[#e3e2df] bg-[#faf9f5] px-2 py-1.5">
                                      <span className="text-xs text-[#434651] min-w-0 flex-1">{child.label} {child.isCritical ? <span className="ml-1 font-bold text-[#8c4f00]">★</span> : null}</span>
                                      <span className={`px-2 py-1 text-[11px] font-bold uppercase tracking-wider border ${val === 1 ? "border-[#0b6b2e] bg-[#0b6b2e] text-white" : val === 0 ? "border-[#8b0000] bg-[#8b0000] text-white" : "border-[#c4c6d3] bg-white text-[#747782]"}`}>{val === 1 ? "YES" : val === 0 ? "NO" : "—"}</span>
                                      {(() => { const all = claim.rubricScores.filter((s) => s.rubricCategory.id === child.id); const judgeIds = new Set(all.map((s) => (s as any).judgeId ?? 0)); return judgeIds.size > 1 ? <span className="text-[10px] text-[#747782]">{all.map((s) => `${(s as any).judge?.name ?? 'J' + String((s as any).judgeId ?? 0)}: ${s.score ? 'YES':'NO'}`).join(' · ')}</span> : null; })()}
                                      <input
                                        type="number"
                                        min={0}
                                        max={1}
                                        placeholder="0/1"
                                        className="w-14 border border-[#c4c6d3] px-2 py-1 text-sm"
                                        value={overrides[key] ?? ""}
                                        onChange={(e) => setOverrides((p) => ({ ...p, [key]: e.target.value }))}
                                      />
                                      <input placeholder="reason" className="w-28 border border-[#c4c6d3] px-2 py-1 text-xs" value={reasons[key] ?? ""} onChange={(e) => setReasons((p) => ({ ...p, [key]: e.target.value }))} />
                                      <button type="button" onClick={() => void override(claim.id, child.id)} className={btnGhost + " px-2 py-1 text-[10px]"}>Override</button>
                                      {row?.comment?.startsWith("[OVERRIDE]") ? <span className="text-[10px] text-[#8c4f00]">(override)</span> : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                        <div className="flex justify-end border-t border-[#e3e2df] pt-2">
                          <span className="text-xs font-bold text-[#002155]">Total: {yes}/25 YES — averaged across {new Set(claim.rubricScores.map((s) => (s as any).judgeId ?? 0)).size} judge(s)</span>
                        </div>
                      </>
                    );
                  }
                  // Legacy flat categories fallback
                  return (
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {categories.map((cat) => {
                        const scoreRow = claim.rubricScores.find((s) => s.rubricCategory.id === cat.id);
                        const key = `${claim.id}:${cat.id}`;
                        return (
                          <div key={cat.id} className="flex flex-wrap items-center gap-2 border border-[#e3e2df] bg-white px-3 py-2">
                            <div className="min-w-40 flex-1">
                              <p className="text-xs font-semibold text-[#002155]">{cat.label}</p>
                              <p className="text-[11px] text-[#747782]">Judge score: {scoreRow ? scoreRow.score : "—"} / {cat.weight}{scoreRow?.comment?.startsWith("[OVERRIDE]") ? " (override)" : ""}</p>
                            </div>
                            <input type="number" min={0} max={cat.weight} placeholder={String(cat.weight)} className="w-20 border border-[#c4c6d3] px-2 py-1 text-sm" value={overrides[key] ?? ""} onChange={(e) => setOverrides((p) => ({ ...p, [key]: e.target.value }))} />
                            <input placeholder="reason" className="w-36 border border-[#c4c6d3] px-2 py-1 text-xs" value={reasons[key] ?? ""} onChange={(e) => setReasons((p) => ({ ...p, [key]: e.target.value }))} />
                            <button type="button" onClick={() => void override(claim.id, cat.id)} className={btnGhost + " px-3 py-1 text-[10px]"}>Override</button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              {(() => {
                const c = claim.rubricScores.find((s) => (s.comment ?? "").trim().length > 0 && !(s.comment ?? "").startsWith("[OVERRIDE]")) ;
                return c?.comment ? (
                  <div className="mt-3 border border-[#e3e2df] bg-white px-3 py-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#002155]">Judge comment</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[#434651] ">{c.comment}</p>
                  </div>
                ) : null;
              })()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Feedback ──────────────────────────────────────────────────────────── */
type FeedbackRow = { id: number; rating: number; comment: string | null; createdAt: string; user: { id: number; name: string; email: string } };

function FeedbackTab({ eventId }: { eventId: number }) {
  const [rows, setRows] = useState<FeedbackRow[]>([]);

  useEffect(() => {
    void fetch(`/api/innovation/events/${eventId}/feedback`, { credentials: "include" })
      .then((r) => r.json())
      .then((b: Api<{ rows: FeedbackRow[] }>) => {
        if (b.success) setRows(b.data.rows);
      });
  }, [eventId]);

  const avg = rows.length ? (rows.reduce((s, r) => s + r.rating, 0) / rows.length).toFixed(1) : "—";

  return (
    <div className="border border-[#c4c6d3] bg-white p-5">
      <h3 className="font-headline text-xl text-[#002155]">
        Student Feedback <span className="text-sm text-[#747782]">({rows.length} responses · avg {avg}/5)</span>
      </h3>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-[#747782]">No feedback yet — it opens after the event closes.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="border border-[#e3e2df] bg-[#faf9f5] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-[#002155]">
                  {r.user.name} <span className="font-normal text-[#747782]">({r.user.email})</span>
                </p>
                <p className="text-sm text-[#8c4f00]">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</p>
              </div>
              {r.comment ? <p className="mt-1 text-sm text-[#434651]">{r.comment}</p> : null}
              <p className="mt-1 text-[11px] text-[#747782]">{new Date(r.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Media ─────────────────────────────────────────────────────────────── */
type MediaRow = { id: number; kind: string; fileKey: string; caption: string | null; createdAt: string };

function MediaTab({ eventId, notify }: { eventId: number; notify: (m: string) => void }) {
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [kind, setKind] = useState("PHOTO");
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void fetch(`/api/innovation/events/${eventId}/ops/media`, { credentials: "include" })
      .then((r) => r.json())
      .then((b: Api<{ media: MediaRow[] }>) => {
        if (b.success) setRows(b.data.media);
      });
  }, [eventId]);
  useEffect(load, [load]);

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("caption", caption);
    fd.append("file", file);
    const res = await fetch(`/api/innovation/events/${eventId}/ops/media`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    const b = (await res.json()) as Api<unknown>;
    notify(b.success ? b.message : b.message);
    setBusy(false);
    if (b.success) {
      setCaption("");
      setFile(null);
      load();
    }
  };

  const remove = async (id: number) => {
    const res = await fetch(`/api/innovation/events/${eventId}/ops/media/${id}`, { method: "DELETE", credentials: "include" });
    const b = (await res.json()) as Api<unknown>;
    if (b.success) load();
  };

  return (
    <div className="border border-[#c4c6d3] bg-white p-5">
      <h3 className="font-headline text-xl text-[#002155]">Final Report & Gallery</h3>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[140px_1fr_auto_auto]">
        <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="REPORT">REPORT (PDF)</option>
          <option value="PHOTO">PHOTO</option>
          <option value="VIDEO">VIDEO</option>
        </select>
        <input className={inputCls} placeholder="Caption (optional)" value={caption} onChange={(e) => setCaption(e.target.value)} />
        <input type="file" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="button" onClick={() => void upload()} className={btnCls} disabled={busy || !file}>
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-[#747782]">Nothing uploaded yet.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {rows.map((m) => (
            <div key={m.id} className="flex items-center justify-between border border-[#e3e2df] bg-[#faf9f5] px-4 py-3">
              <div>
                <p className="font-semibold text-[#002155]">
                  {m.kind} {m.caption ? `— ${m.caption}` : ""}
                </p>
                <p className="text-xs text-[#747782]">{m.fileKey.split("/").pop()}</p>
              </div>
              <button type="button" onClick={() => void remove(m.id)} className="text-xs font-bold uppercase tracking-wider text-red-600 hover:underline">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
