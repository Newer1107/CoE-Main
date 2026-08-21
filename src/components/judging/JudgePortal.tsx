"use client";

import { useCallback, useEffect, useState } from "react";

type Assignment = {
  id: number;
  event: { id: number; title: string; status: string };
  venue: { id: number; name: string } | null;
};

type Category = { id: number; key: string; label: string; weight: number; isCritical: boolean; parentCategoryId: number | null };
type JudgeClaim = {
  id: number;
  teamName: string | null;
  venue: { id: number; name: string } | null;
  problem: { id: number; title: string };
  members: { user: { name: string; email: string; uid: string | null } }[];
  rubricScores: { score: number; comment: string | null; rubricCategory: { id: number } }[];
};

type Api<T> = { success: boolean; message: string; data: T };

const inputCls = "border border-[#c4c6d3] bg-white px-2 py-1 text-sm focus:outline-none focus:border-[#002155]";

export default function JudgePortal() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventId, setEventId] = useState<number | null>(null);
  const [data, setData] = useState<{
    round: number;
    maxRound: number;
    venue: { id: number; name: string } | null;
    categories: Category[];
    claims: JudgeClaim[];
  } | null>(null);
  const [values, setValues] = useState<Record<string, Record<string, string | number>>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  const notify = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 3000);
  };

  const loadOverview = useCallback(() => {
    void fetch("/api/innovation/judge/overview", { credentials: "include" })
      .then((r) => r.json())
      .then((b: Api<{ assignments: Assignment[] }>) => {
        if (b.success) {
          setAssignments(b.data.assignments);
          if (b.data.assignments.length > 0 && eventId === null) {
            setEventId(b.data.assignments[0].event.id);
          }
        }
        setLoading(false);
      });
  }, [eventId]);

  useEffect(loadOverview, [loadOverview]);

  const loadClaims = useCallback(() => {
    if (eventId === null) return;
    void fetch(`/api/innovation/judge/claims?eventId=${eventId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((b: Api<{ round: number; maxRound: number; venue: { id: number; name: string } | null; categories: Category[]; claims: JudgeClaim[] }>) => {
        if (!b.success) {
          notify(b.message);
          setData(null);
          return;
        }
        setData(b.data);
        // prefill values from existing scores
        const v: Record<string, Record<string, string>> = {};
        const c: Record<string, string> = {};
        for (const claim of b.data.claims) {
          v[claim.id] = {};
          for (const s of claim.rubricScores) {
            v[claim.id][s.rubricCategory.id] = String(s.score);
            if (s.comment) c[claim.id] = s.comment;
          }
        }
        setValues(v);
        setComments(c);
        setSaved({});
      });
  }, [eventId]);

  useEffect(loadClaims, [loadClaims]);

  const save = async (claimId: number) => {
    const claimValues = values[claimId] ?? {};
    const rubricValues: Record<string, number> = {};
    for (const cat of data?.categories ?? []) {
      const raw = claimValues[cat.id];
      if (raw !== undefined && raw !== "") rubricValues[cat.id] = Number(raw);
    }
    if (Object.keys(rubricValues).length === 0) {
      notify("Enter at least one score");
      return;
    }
    const res = await fetch(`/api/innovation/judge/claims/${claimId}/score`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rubricValues, comment: comments[claimId] ?? "" }),
    });
    const b = (await res.json()) as Api<unknown>;
    notify(b.success ? `Saved — ${b.message}` : b.message);
    if (b.success) {
      setSaved((p) => ({ ...p, [claimId]: new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }) }));
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-5xl px-4 py-12 text-sm text-[#747782]">Loading your judging assignments…</div>;
  }

  if (assignments.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="font-headline text-3xl text-[#002155]">Judge Portal</h1>
        <p className="mt-2 border border-dashed border-[#c4c6d3] bg-white p-6 text-sm text-[#434651]">
          You are not assigned to judge any event yet. The coordinator assigns judges from the event's Coordinator Panel.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {toast ? (
        <div className="fixed right-4 top-4 z-50 border border-[#0b6b2e] bg-[#f2fbf4] px-4 py-3 text-sm font-semibold text-[#0b6b2e] shadow-lg">
          {toast}
        </div>
      ) : null}
      <p className="text-xs uppercase tracking-widest text-[#8c4f00]">Judge Portal</p>
      <h1 className="mt-1 font-headline text-3xl text-[#002155]">Score Teams</h1>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select
          className={inputCls + " min-w-72"}
          value={eventId ?? ""}
          onChange={(e) => setEventId(Number(e.target.value))}
        >
          {assignments.map((a) => (
            <option key={a.id} value={a.event.id}>
              {a.event.title} · {a.event.status} {a.venue ? `· ${a.venue.name}` : "· All claims"}
            </option>
          ))}
        </select>
        {data ? (
          <p className="text-sm text-[#434651]">
            Judging Session
            {data.venue ? ` · Venue: ${data.venue.name}` : " · All claims"}
          </p>
        ) : null}
      </div>

      {!data ? (
        <p className="mt-6 border border-dashed border-[#c4c6d3] bg-white p-6 text-sm text-[#434651]">
          Judging is not open for this event yet (it opens in the JUDGING phase), or you have no claims in scope.
        </p>
      ) : data.claims.length === 0 ? (
        <p className="mt-6 border border-dashed border-[#c4c6d3] bg-white p-6 text-sm text-[#434651]">
          No teams in your scope yet.
        </p>
      ) : (
        <div className="mt-6 space-y-5">
          {data.claims.map((claim) => (
            <div key={claim.id} className="border border-[#c4c6d3] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-[#002155]">{claim.teamName ?? `Team #${claim.id}`}</p>
                  <p className="mt-0.5 text-xs text-[#434651]">{claim.problem.title}</p>
                  <p className="mt-0.5 text-xs text-[#747782]">
                    {claim.members.map((m) => m.user.name).join(", ")} · {claim.venue?.name ?? "No venue"}
                  </p>
                </div>
                {saved[claim.id] ? (
                  <p className="text-xs font-semibold text-[#0b6b2e]">Saved {saved[claim.id]}</p>
                ) : null}
              </div>
              <div className="mt-4 space-y-4">
                {data.categories
                  .filter((c) => c.parentCategoryId === null)
                  .map((parent) => {
                    const children = data.categories.filter((c) => c.parentCategoryId === parent.id);
                    return (
                      <div key={parent.id} className="border border-[#e3e2df] bg-[#faf9f5] p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold uppercase tracking-wider text-[#002155]">{parent.label}</p>
                          <span className="text-[11px] text-[#747782]">Weight {parent.weight}</span>
                        </div>
                        <div className="mt-3 space-y-2">
                          {children.map((child) => {
                            const cur = values[claim.id]?.[child.id];
                            const isYes = cur === 1;
                            const isNo = cur === 0;
                            return (
                              <div key={child.id} className="flex items-center gap-3">
                                <span className="text-xs text-[#434651] min-w-0 flex-1">
                                  {child.label}
                                  {child.isCritical ? (
                                    <span className="ml-1 text-[#8c4f00] font-bold" title="Critical">★</span>
                                  ) : null}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setValues((p) => ({ ...p, [claim.id]: { ...(p[claim.id] ?? {}), [child.id]: isYes ? undefined : 1 } }))}
                                  className={`px-3 py-1 text-xs font-bold uppercase tracking-wider border transition-colors ${isYes ? "border-[#0b6b2e] bg-[#0b6b2e] text-white" : "border-[#c4c6d3] bg-white text-[#434651] hover:bg-[#f0f0ee]"}`}
                                >
                                  Yes
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setValues((p) => ({ ...p, [claim.id]: { ...(p[claim.id] ?? {}), [child.id]: isNo ? undefined : 0 } }))}
                                  className={`px-3 py-1 text-xs font-bold uppercase tracking-wider border transition-colors ${isNo ? "border-[#8b0000] bg-[#8b0000] text-white" : "border-[#c4c6d3] bg-white text-[#434651] hover:bg-[#f0f0ee]"}`}
                                >
                                  No
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>
              <textarea
                className={inputCls + " mt-3 w-full min-h-20"}
                placeholder="Comments for the team (optional) — shown to students after results"
                value={comments[claim.id] ?? ""}
                onChange={(e) => setComments((p) => ({ ...p, [claim.id]: e.target.value }))}
              />
              <button type="button" onClick={() => void save(claim.id)} className="mt-3 bg-[#002155] px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:opacity-90">
                Save Scores
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
