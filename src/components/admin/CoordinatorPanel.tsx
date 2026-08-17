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
        {tab === "scores" ? <ScoresTab eventId={eventId} notify={notify} /> : null}
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
  const [coordinators, setCoordinators] = useState<{ id: number; name: string; email: string }[]>([]);
  const [faculty, setFaculty] = useState<{ id: number; name: string; email: string }[]>([]);
  const [coordPick, setCoordPick] = useState("");
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
      .then((b: Api<{ coordinators: { id: number; name: string; email: string }[]; faculty: { id: number; name: string; email: string }[] }>) => {
        if (b.success) {
          setCoordinators(b.data.coordinators);
          setFaculty(b.data.faculty);
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
      body: JSON.stringify({ coordinatorId: Number(coordPick) }),
    });
    const b = (await res.json()) as Api<unknown>;
    notify(b.success ? b.message : b.message);
    if (b.success) {
      setCoordPick("");
      load();
    }
  };

  const removeCoordinator = async (userId: number) => {
    const res = await fetch(`/api/innovation/events/${eventId}/ops/coordinator`, {
      method: "DELETE",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ coordinatorId: userId }),
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
              <li key={c.id} className="flex items-center justify-between gap-3 border-b border-[#e3e2df] py-1.5 text-sm">
                <span className="text-[#434651]">
                  <span className="font-bold text-[#002155]">{c.name}</span> ({c.email})
                </span>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => void removeCoordinator(c.id)}
                    className="text-xs font-bold text-[#ba1a1a] underline hover:opacity-70"
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-[#747782]">No coordinator assigned — an admin can assign teachers below.</p>
        )}
        {isAdmin ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select className={inputCls + " md:w-80"} value={coordPick} onChange={(e) => setCoordPick(e.target.value)}>
              <option value="">Add a teacher as coordinator…</option>
              {faculty
                .filter((f) => !coordinators.some((c) => c.id === f.id))
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.email})
                  </option>
                ))}
            </select>
            <button type="button" onClick={() => void saveCoordinator()} className={btnCls} disabled={!coordPick}>
              Add Coordinator
            </button>
          </div>
        ) : null}
        <p className="mt-2 text-xs text-[#747782]">
          Every coordinator gets full access to this event's panel. Non-coordinators are denied.
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
type VenueRow = { id: number; name: string; capacity: number | null; order: number; _count: { claims: number } };
type ClaimLite = { id: number; teamName: string | null; status: string; presentationScheduledAt: string | null; members: { role: string; user: { name: string; uid: string | null; email: string } }[] };

function VenuesTab({ eventId, notify }: { eventId: number; notify: (m: string) => void }) {
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [unassigned, setUnassigned] = useState<ClaimLite[]>([]);
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [venueSlotInputs, setVenueSlotInputs] = useState<Record<string, string>>({});
  const [venueSlotBusy, setVenueSlotBusy] = useState(false);
  const [targetVenue, setTargetVenue] = useState("");

  const load = useCallback(() => {
    void fetch(`/api/innovation/events/${eventId}/ops/venues`, { credentials: "include" })
      .then((r) => r.json())
      .then((b: Api<{ venues: VenueRow[]; unassignedClaims: ClaimLite[] }>) => {
        if (b.success) {
          setVenues(b.data.venues);
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
      body: JSON.stringify({ name: name.trim(), capacity: capacity ? Number(capacity) : null }),
    });
    const body = (await res.json()) as Api<unknown>;
    notify(body.message);
    if (body.success) {
      setName("");
      setCapacity("");
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
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_140px_auto]">
          <input className={inputCls} placeholder="Venue name (e.g. Seminar Hall 1)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={inputCls} placeholder="Capacity (optional)" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          <button type="button" onClick={() => void create()} className={btnCls}>
            Add Venue
          </button>
        </div>
        {venues.length === 0 ? (
          <p className="mt-3 text-sm text-[#747782]">No venues yet — add them before assigning teams.</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {venues.map((v) => (
              <div key={v.id} className="flex items-center justify-between border border-[#e3e2df] bg-[#faf9f5] px-4 py-3">
                <div>
                  <p className="font-semibold text-[#002155]">{v.name}</p>
                  <p className="text-xs text-[#434651]">
                    {v._count.claims} team{v._count.claims === 1 ? "" : "s"}
                    {v.capacity !== null ? ` / capacity ${v.capacity}` : " · no capacity limit"}
                  </p>
                </div>
                <button type="button" onClick={() => void remove(v.id, v.name)} className="text-xs font-bold uppercase tracking-wider text-red-600 hover:underline">
                  Delete
                </button>
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
        {unassigned.length === 0 ? (
          <p className="mt-3 text-sm text-[#0b6b2e]">All teams are assigned. ✓</p>
        ) : (
          <div className="mt-3 max-h-72 overflow-auto border border-[#e3e2df]">
            <table className="w-full text-sm">
              <thead className="bg-[#f4f6fa] text-left text-xs uppercase tracking-wider text-[#434651]">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Lead UID</th>
                  <th className="px-3 py-2">Presentation Slot</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {unassigned.map((c) => (
                  <tr key={c.id} className="border-t border-[#e3e2df]">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                    </td>
                    <td className="px-3 py-2 font-semibold text-[#002155]">{c.teamName ?? `Team #${c.id}`}</td>
                    <td className="px-3 py-2 text-xs text-[#434651]">{c.members.find((m) => m.role === "LEAD")?.user.uid ?? "—"}</td>
                    <td className="px-3 py-2 text-[11px] text-[#747782]">{c.members.map((m) => m.user.name + " (" + (m.user.uid || "") + ")").join(", ")}</td>
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
type JudgeRow = { id: number; judge: { id: number; name: string; email: string; role: string }; venue: { id: number; name: string } | null };

function JudgesTab({ eventId, notify }: { eventId: number; notify: (m: string) => void }) {
  const [rows, setRows] = useState<JudgeRow[]>([]);
  const [venues, setVenues] = useState<{ id: number; name: string }[]>([]);
  const [faculty, setFaculty] = useState<{ id: number; name: string; email: string; role: string }[]>([]);
  const [judgeId, setJudgeId] = useState("");
  const [venueId, setVenueId] = useState("");

  const load = useCallback(() => {
    void fetch(`/api/innovation/events/${eventId}/ops/judges`, { credentials: "include" })
      .then((r) => r.json())
      .then((b: Api<{ assignments: JudgeRow[]; venues: { id: number; name: string }[]; faculty: { id: number; name: string; email: string; role: string }[] }>) => {
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

  const remove = async (id: number) => {
    const res = await fetch(`/api/innovation/events/${eventId}/ops/judges/${id}`, {
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
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 border border-[#e3e2df] bg-[#faf9f5] px-4 py-3">
              <div>
                <p className="font-semibold text-[#002155]">{r.judge.name}</p>
                <p className="text-xs text-[#434651]">
                  {r.judge.email} · {r.judge.role} · scope: {r.venue ? r.venue.name : "All claims"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="border border-[#c4c6d3] bg-white px-2 py-1 text-xs"
                  value={r.venue?.id ?? ""}
                  onChange={(e) => void move(r.id, e.target.value)}
                >
                  <option value="">All claims</option>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => void remove(r.id)} className="text-xs font-bold uppercase tracking-wider text-red-600 hover:underline">
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
type ScoreRow = { id: number; score: number; comment: string | null; rubricCategory: { id: number; key: string; label: string; weight: number } };
type ScoreClaim = {
  id: number;
  teamName: string | null;
  venue: { id: number; name: string } | null;
  problem: { id: number; title: string } | null;
  presentationScheduledAt: string | null;
  rubricScores: ScoreRow[];
  members: { role: string; user: { name: string; email: string; uid: string | null } }[];
};

function ScoresTab({ eventId, notify }: { eventId: number; notify: (m: string) => void }) {
  const [categories, setCategories] = useState<{ id: number; key: string; label: string; weight: number }[]>([]);
  const [claims, setClaims] = useState<ScoreClaim[]>([]);
  const [problems, setProblems] = useState<{ id: number; title: string }[]>([]);
  const [round, setRound] = useState<number | null>(null);
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

  const load = useCallback(() => {
    void fetch(`/api/innovation/events/${eventId}/ops/scores`, { credentials: "include" })
      .then((r) => r.json())
      .then((b: Api<{ categories: { id: number; key: string; label: string; weight: number }[]; claims: ScoreClaim[]; round: number; problems: { id: number; title: string }[]; allowOpenInnovation: boolean }>) => {
        if (b.success) {
          setCategories(b.data.categories);
          setClaims(b.data.claims);
          setRound(b.data.round);
          if (b.data.problems) setProblems(b.data.problems);
          setAllowOI(b.data.allowOpenInnovation);
        }
      });
  }, [eventId]);
  useEffect(load, [load]);

  const totalFor = (claim: ScoreClaim) => claim.rubricScores.reduce((sum, s) => sum + s.score, 0);

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

  return (
    <div className="border border-[#c4c6d3] bg-white p-5">
      <h3 className="font-headline text-xl text-[#002155]">
        Score Review {round ? <span className="text-sm font-normal text-[#747782]">— Round {round}</span> : null}
      </h3>
      <p className="mt-1 text-sm text-[#434651]">
        Live totals from judges. Overrides are allowed while the event is in JUDGING and are logged with the reason.
      </p>
      {claims.length === 0 ? (
        <p className="mt-4 text-sm text-[#747782]">No claims yet.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {claims.map((claim) => (
            <div key={claim.id} className="border border-[#e3e2df] bg-[#faf9f5] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-[#002155]">{claim.teamName ?? `Team #${claim.id}`}</p>
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
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                {categories.map((cat) => {
                  const scoreRow = claim.rubricScores.find((s) => s.rubricCategory.id === cat.id);
                  const key = `${claim.id}:${cat.id}`;
                  return (
                    <div key={cat.id} className="flex flex-wrap items-center gap-2 border border-[#e3e2df] bg-white px-3 py-2">
                      <div className="min-w-40 flex-1">
                        <p className="text-xs font-semibold text-[#002155]">{cat.label}</p>
                        <p className="text-[11px] text-[#747782]">
                          Judge score: {scoreRow ? scoreRow.score : "—"} / {cat.weight}
                          {scoreRow?.comment?.startsWith("[OVERRIDE]") ? " (override)" : ""}
                        </p>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={cat.weight}
                        placeholder={String(cat.weight)}
                        className="w-20 border border-[#c4c6d3] px-2 py-1 text-sm"
                        value={overrides[key] ?? ""}
                        onChange={(e) => setOverrides((p) => ({ ...p, [key]: e.target.value }))}
                      />
                      <input
                        placeholder="reason"
                        className="w-36 border border-[#c4c6d3] px-2 py-1 text-xs"
                        value={reasons[key] ?? ""}
                        onChange={(e) => setReasons((p) => ({ ...p, [key]: e.target.value }))}
                      />
                      <button type="button" onClick={() => void override(claim.id, cat.id)} className={btnGhost + " px-3 py-1 text-[10px]"}>
                        Override
                      </button>
                    </div>
                  );
                })}
              </div>
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
