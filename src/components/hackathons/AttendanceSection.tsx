"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type AttendanceRow = {
  subject: string;
  type: string;
  present: number;
  total: number;
  percentage: number;
  periodStart: string | null;
  periodEnd: string | null;
};
type JobInfo = { id: number; status: string; attempts: number; lastError: string | null } | null;
type ApiData = {
  eligible: boolean;
  rows: AttendanceRow[];
  lastSyncedAt: string | null;
  job: JobInfo;
};

const STALE_MS = 24 * 3600 * 1000;
const POLL_MS = 5000;
const MAX_POLLS = 24;

const fmtDate = (v: string | null | undefined) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
};

const buttonCls =
  "inline-flex items-center gap-1.5 border border-primary px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary transition-colors hover:bg-primary hover:text-white disabled:opacity-50";

export default function AttendanceSection() {
  const [data, setData] = useState<ApiData | null>(null);
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [queued, setQueued] = useState(false);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [liveJob, setLiveJob] = useState<JobInfo | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (maxTicks = MAX_POLLS) => {
    stopPolling();
    let ticks = 0;
    pollRef.current = window.setInterval(async () => {
      ticks += 1;
      setElapsed(ticks * 5);
      try {
        const st = await fetch("/api/attendance/status", { credentials: "include" }).then((r) => r.json());
        const status = st?.data?.job?.status;
        setLiveJob(st?.data?.job ?? null);
        if (status === "SUCCESS" || status === "FAILED") {
          stopPolling();
          setQueued(false);
          setPending(false);
          await load();
        } else if (ticks >= maxTicks) {
          // Never poll forever: if the job is still pending after the cap,
          // show an honest "still syncing in background" state instead.
          stopPolling();
          setQueued(false);
          setPending(true);
        }
      } catch {
        if (ticks >= maxTicks) {
          stopPolling();
          setQueued(false);
          setPending(true);
        }
      }
    }, POLL_MS);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance", { credentials: "include" });
      if (res.status === 403) return setHidden(true);
      const body = await res.json();
      if (!body?.data?.eligible) return setHidden(true);
      setData(body.data);
      setLiveJob(body.data.job ?? null);
      const running = body.data.job?.status === "QUEUED" || body.data.job?.status === "RUNNING";
      setQueued(running);
      setPending(false);
      if (running) startPolling(); // job enqueued elsewhere — poll until it settles
    } catch {
      /* keep last rendered state */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return stopPolling;
  }, [load]);

  const startSync = async () => {
    setBusy(true);
    setElapsed(0);
    try {
      const res = await fetch("/api/attendance/refresh", { method: "POST", credentials: "include" });
      const body = await res.json();
      if (!body?.data?.jobId) return;
      setQueued(true);
      startPolling();
    } finally {
      setBusy(false);
    }
  };

  if (hidden) return null;
  const rows = data?.rows ?? [];
  const job = data?.job ?? null;
  const failed = job?.status === "FAILED";
  const hasData = rows.length > 0;
  const lastSynced = data?.lastSyncedAt ?? null;
  const stale = !!lastSynced && Date.now() - new Date(lastSynced).getTime() > STALE_MS;
  const totalPresent = rows.reduce((s, r) => s + r.present, 0);
  const totalAll = rows.reduce((s, r) => s + r.total, 0);
  const overall = totalAll > 0 ? ((totalPresent / totalAll) * 100).toFixed(1) : null;
  const periodStart = fmtDate(rows[0]?.periodStart ?? null);
  const periodEnd = fmtDate(rows[0]?.periodEnd ?? null);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 border-b border-hairline pb-3">
        <h2 className="font-headline text-xl font-bold text-primary">Attendance</h2>
        {stale ? (
          <span className="border border-amber-300 bg-amber-100 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-800">
            Stale
          </span>
        ) : null}
        <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
      </div>

      {loading ? (
        <div className="h-24 animate-pulse border border-outline-variant bg-surface-container" aria-busy="true" />
      ) : pending ? (
        <div role="status" aria-live="polite" className="border border-outline-variant bg-surface-container p-5">
          <p className="text-sm font-semibold text-primary">Still syncing in the background…</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            The ERP can take a couple of minutes. Refresh this page to check — your last
            data stays visible until the new sync lands.
          </p>
        </div>
      ) : queued ? (
        <div role="status" aria-live="polite" className="border border-outline-variant bg-surface-container p-5">
          <p className="text-sm font-semibold text-primary">Syncing with ERP…</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            {liveJob?.status === "RUNNING"
              ? `Fetching your attendance from the ERP${liveJob.attempts > 1 ? ` — attempt ${liveJob.attempts}/2` : ""}. Usually under a minute; the ERP is sometimes slow.`
              : liveJob?.status === "QUEUED"
                ? "Queued — the sync worker picks it up within seconds."
                : "Connecting to the ERP…"}
          </p>
          <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} elapsed — updates automatically
          </p>
        </div>
      ) : hasData ? (
        <div className="border-y border-hairline">
          {periodStart ? (
            <p className="border-b border-hairline px-1 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Period: {periodStart} — {periodEnd ?? "now"}
            </p>
          ) : null}
          {(["TH", "PR", "TU"] as const).map((type) => {
            const group = rows.filter((r) => r.type === type);
            if (group.length === 0) return null;
            const gp = group.reduce((s, r) => s + r.present, 0);
            const gt = group.reduce((s, r) => s + r.total, 0);
            const label = { TH: "Theory", PR: "Practical", TU: "Tutorial" }[type];
            return (
              <div key={type}>
                <p className="flex items-center justify-between border-b border-hairline bg-surface-container px-1 py-2">
                  <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary">
                    {label}
                  </span>
                  <span className="font-mono text-[10px] font-bold tabular-nums text-secondary">
                    {gt > 0 ? `${((gp / gt) * 100).toFixed(2)}%` : "—"} · {gp}/{gt}
                  </span>
                </p>
                <ul className="divide-y divide-hairline">
                  {group.map((r) => (
                    <li key={`${r.subject}-${r.type}`} className="flex items-center justify-between gap-3 py-2.5">
                      <p className="truncate text-sm font-semibold text-primary">{r.subject}</p>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-sm font-bold tabular-nums text-primary">
                          {r.present}/{r.total}
                        </p>
                        <p className="font-mono text-[10px] tabular-nums text-secondary">{r.percentage}%</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline bg-surface-container px-1 py-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                Overall · synced {fmtDate(lastSynced)}
              </p>
              <p className="font-headline text-2xl font-bold tabular-nums text-primary">
                {overall !== null ? `${overall}%` : "—"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {failed ? (
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-error">
                  ERP unreachable — retry later
                </span>
              ) : null}
              <button type="button" onClick={() => void startSync()} disabled={busy} className={buttonCls}>
                {failed ? "Retry ↻" : "Refresh ↻"}
              </button>
            </div>
          </div>
        </div>
      ) : failed ? (
        <div className="border border-outline-variant bg-surface-container p-5">
          <p className="text-sm font-semibold text-primary">
            {job?.lastError === "PARSE_EMPTY"
              ? "No attendance recorded"
              : job?.lastError === "PARSE_NO_RECORD"
                ? "No ERP record for this account"
                : "ERP unreachable"}
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            {job?.lastError === "PARSE_EMPTY"
              ? "No subjects found for this period yet — check again after classes start."
              : job?.lastError === "PARSE_NO_RECORD"
                ? "The ERP has no attendance record for this account — contact the office."
                : "Attendance sync failed. Try again in a few minutes."}
          </p>
          <button type="button" onClick={() => void startSync()} disabled={busy} className={`${buttonCls} mt-3`}>
            Retry ↻
          </button>
        </div>
      ) : (
        <div className="border border-outline-variant bg-surface-container p-5">
          <p className="text-sm font-semibold text-primary">No attendance synced yet</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Your ERP attendance (Theory / Practical / Tutorial) appears here after the first sync.
          </p>
          <button type="button" onClick={() => void startSync()} disabled={busy} className={`${buttonCls} mt-3`}>
            Sync attendance
          </button>
        </div>
      )}
    </div>
  );
}
